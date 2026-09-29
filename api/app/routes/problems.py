import io
import json
import zipfile
from pydantic import ValidationError

from fastapi import APIRouter, Depends, status, HTTPException, UploadFile, Form, File, Query
from sqlalchemy.orm import Session
from typing import List, Dict, BinaryIO
from sqlalchemy import func

from ..schemas.problems import ProblemResponse, ProblemDetailResponse, ProblemArrayDataValidator, TagCreate, TagResponse, ProblemCreateResponse, ProblemListResponse
from ..utils import oauth2
from ..database import get_db

from shared.core import get_storage_testcases, get_storage_submission_code
from shared.models import (
    Problem, Category, TestCase, # problems
    Submission, # submissions
    User, # users
    Difficulty # enums
)

router = APIRouter(
    prefix='/problems',
    tags=["Problems"]
)

def _problem_summary(problem: Problem) -> dict:
    return {
        "id": problem.id,
        "title": problem.title,
        "difficulty": problem.difficulty,
        "tags": [tag.slug for tag in problem.tags],
        "accepted_submissions": problem.accepted_submissions or 0,
        "total_submissions": problem.total_submissions or 0,
    }

@router.post('/tag', status_code=status.HTTP_201_CREATED, response_model=TagResponse)
def create_tag(tag: TagCreate, current_user: User = Depends(oauth2.get_current_admin), db: Session = Depends(get_db)):
    # Chart a new constellation (category) so problems can be tagged with it
    slug = tag.slug.strip().lower()
    name = tag.name.strip()
    if not slug or not name:
        raise HTTPException(detail="Tag name and slug must be non-empty", status_code=status.HTTP_400_BAD_REQUEST)

    if db.query(Category).filter(Category.slug == slug).first():
        raise HTTPException(detail="Tag with this slug already exists", status_code=status.HTTP_409_CONFLICT)

    category = Category(name=name, slug=slug)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category

@router.get('/tags', status_code=status.HTTP_200_OK, response_model=List[TagResponse])
def list_tags(db: Session = Depends(get_db)):
    # Public star-map of every available tag
    return db.query(Category).order_by(Category.slug.asc()).all()

@router.get('/', status_code=status.HTTP_200_OK, response_model=ProblemListResponse)
def get_problems(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    title: str | None = Query(default=None, description="Case-insensitive title substring"),
    difficulty: Difficulty | None = None,
    tag: str | None = Query(default=None, description="Tag slug"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(oauth2.get_optional_current_admin)
):
    # Scan the sky, applying filters
    query = db.query(Problem)
    if not current_user:
        query = query.filter(Problem.visibility == True)
    if title:
        escaped = title.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(Problem.title.ilike(f"%{escaped}%", escape="\\"))
    if difficulty:
        query = query.filter(Problem.difficulty == difficulty)
    if tag:
        query = query.filter(Problem.tags.any(Category.slug == tag.strip().lower()))

    total = query.with_entities(func.count(Problem.id)).scalar()

    # BUG FIX: pages are 1-indexed, so the first page starts at offset 0 (was page * limit)
    offset = (page - 1) * limit
    problems = query.order_by(Problem.id.asc()).offset(offset).limit(limit).all()

    return {
        "items": [_problem_summary(problem) for problem in problems],
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": offset + len(problems) < total,
    }

@router.get('/{problem_id}', status_code=status.HTTP_200_OK, response_model=ProblemDetailResponse)
def get_problem_by_id(problem_id: str, db: Session = Depends(get_db), current_user: User | None = Depends(oauth2.get_optional_current_admin)):
    if current_user:
        problem = db.query(Problem).filter(Problem.id == problem_id).first()
    else:
        problem = db.query(Problem).filter(Problem.id == problem_id, Problem.visibility == True).first()
    
    if not problem:
        raise HTTPException(detail="requested problem doesn't exist", status_code=status.HTTP_404_NOT_FOUND)
    
    return {
        "id": problem.id,
        "title": problem.title,
        "difficulty": problem.difficulty,
        "tags": [tag.slug for tag in problem.tags],
        "accepted_submissions": problem.accepted_submissions or 0,
        "total_submissions": problem.total_submissions or 0,

        "description": problem.description,
        "constraints": problem.constraints,
        "input_desc": problem.input_desc,
        "output_desc": problem.output_desc,
        "sample_io": problem.sample_io,
        "explanation": problem.explanation,

        "memory_limit_mb": problem.memory_limit_mb,
        "time_limit_sec": problem.time_limit_sec,

        "source": problem.source,
        "editorial": problem.editorial,
        "visibility": problem.visibility
    }

@router.post('/', status_code=status.HTTP_201_CREATED, response_model=ProblemCreateResponse)
async def create_problem(
    id: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    difficulty: Difficulty = Form(...),
    constraints: str = Form(...),
    tags: str = Form(...),
    sample_io: str = Form(...),

    input_desc: str = Form(...),
    output_desc: str = Form(...),
    explanation: str | None = Form(None),

    memory_limit_mb: int = Form(...),
    time_limit_sec: int = Form(...),

    visibility: bool = Form(False),
    source: str | None = Form(None),
    editorial: str | None = Form(None),

    tests_zip: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(oauth2.get_current_admin)
):
    
    # Validating Problem Id
    problem = db.query(Problem).filter(Problem.id == id).first()
    if problem:
        raise HTTPException(detail="Problem with key already exists", status_code=status.HTTP_400_BAD_REQUEST)
    
    # Validate Zip Files
    if not tests_zip.filename.endswith(".zip"):
        raise HTTPException(detail="Only ZIP files are allowed", status_code=status.HTTP_400_BAD_REQUEST)

    zip_bytes = await tests_zip.read()

    try:
        zip_file = zipfile.ZipFile(
            io.BytesIO(zip_bytes)
        )
    except zipfile.BadZipFile:
        raise HTTPException(detail="Invalid ZIP file", status_code=status.HTTP_400_BAD_REQUEST)

    # Validate Required Folders
    all_files = zip_file.namelist()
    prefix = tests_zip.filename.split(".")[0]

    input_files = sorted([
        f for f in all_files
        if f.startswith(prefix + "/inputs/")
        and not f.endswith("/")
    ])

    output_files = sorted([
        f for f in all_files
        if f.startswith(prefix + "/outputs/")
        and not f.endswith("/")
    ])

    if not input_files or not output_files:
        zip_file.close()
        raise HTTPException(detail="ZIP must contain inputs/ and outputs/", status_code=status.HTTP_400_BAD_REQUEST)
    if len(input_files) != len(output_files):
        zip_file.close()
        raise HTTPException(detail="Mismatch between input and output files", status_code=status.HTTP_400_BAD_REQUEST)
    
    for input_file, output_file in zip(input_files, output_files):
        if input_file.split("/")[-1] != output_file.split("/")[-1]:
            zip_file.close()
            raise HTTPException(detail="Mismatch in input and output file name. Each input file should have a corespoinding output file", status_code=status.HTTP_400_BAD_REQUEST)
    
    # Validating Array Data
    try:
        array_data = ProblemArrayDataValidator(
            tags=json.loads(tags),
            constraints=json.loads(constraints),
            sample_io=json.loads(sample_io)
        )
    except (json.JSONDecodeError, ValidationError):
        zip_file.close()
        raise HTTPException(detail="Invalid format for tags, constraints, or sample_io", status_code=status.HTTP_400_BAD_REQUEST)
    
    categories = db.query(Category).filter(Category.slug.in_(array_data.tags)).all()
    if len(categories) != len(array_data.tags):
        zip_file.close()
        raise HTTPException(detail="One or more tags are invalid", status_code=status.HTTP_400_BAD_REQUEST)

    # Create Problem
    problem = Problem(
        id=id,
        title=title,
        description=description,
        difficulty=difficulty,

        constraints=array_data.constraints,
        tags=categories,
        sample_io=array_data.sample_io,

        input_desc=input_desc,
        output_desc=output_desc,
        explanation=explanation,

        memory_limit_mb=memory_limit_mb,
        time_limit_sec=time_limit_sec,

        visibility=visibility,
        source=source,
        editorial=editorial
    )

    try:
        db.add(problem)
        db.flush()

        # Upload Testcases
        for input_path, output_path in zip(
            input_files,
            output_files
        ):
            input_data = zip_file.read(input_path)
            output_data = zip_file.read(output_path)

            input_key = get_storage_testcases().upload_bytes(
                problem_id=problem.id,
                filename=input_path.split("/")[-1],
                data=input_data
            )

            output_key = get_storage_testcases().upload_bytes(
                problem_id=problem.id,
                filename=output_path.split("/")[-1],
                data=output_data
            )

            testcase = TestCase(
                problem_id=problem.id,
                input_key=input_key,
                output_key=output_key
            )
            db.add(testcase)
        
        db.commit()
    except Exception:
        db.rollback()
        get_storage_testcases().delete_problem_folder(problem.id)
        raise HTTPException(detail="Unknown Error Occurred", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        zip_file.close()

    return {
        "id": problem.id,
        "title": problem.title,
        "difficulty": problem.difficulty,
        "tags": [category.slug for category in problem.tags],
        "testcases": len(input_files)
    }

@router.delete('/', status_code=status.HTTP_204_NO_CONTENT)
def delete_problem(problem_id: str, current_user: User = Depends(oauth2.get_current_admin), db: Session = Depends(get_db)):
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(detail="Problem with given ID not found", status_code=status.HTTP_404_NOT_FOUND)
    
    submissions = db.query(Submission).filter(Submission.problem_id == problem.id).all()
    for submission in submissions:
        get_storage_submission_code().delete_file(submission.code_object_key)
    
    get_storage_testcases().delete_problem_folder(problem.id)
    
    db.delete(problem)
    db.commit()


def _extract_testcases(zip_bytes: bytes, filename: str):
    """Unpack a testcase cargo-zip into [(name, input_bytes, output_bytes)]."""
    if not filename or not filename.endswith(".zip"):
        raise HTTPException(detail="Only ZIP files are allowed", status_code=status.HTTP_400_BAD_REQUEST)
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(detail="Invalid ZIP file", status_code=status.HTTP_400_BAD_REQUEST)

    with zf:
        prefix = filename.split(".")[0]
        names = zf.namelist()
        ins = sorted(f for f in names if f.startswith(prefix + "/inputs/") and not f.endswith("/"))
        outs = sorted(f for f in names if f.startswith(prefix + "/outputs/") and not f.endswith("/"))
        if not ins or not outs:
            raise HTTPException(detail="ZIP must contain inputs/ and outputs/", status_code=status.HTTP_400_BAD_REQUEST)
        if len(ins) != len(outs) or any(i.split("/")[-1] != o.split("/")[-1] for i, o in zip(ins, outs)):
            raise HTTPException(detail="Each input file needs a matching output file", status_code=status.HTTP_400_BAD_REQUEST)
        return [(i.split("/")[-1], zf.read(i), zf.read(o)) for i, o in zip(ins, outs)]

@router.patch('/{problem_id}', status_code=status.HTTP_200_OK, response_model=ProblemDetailResponse)
async def update_problem(
    problem_id: str,
    title: str | None = Form(None),
    description: str | None = Form(None),
    difficulty: Difficulty | None = Form(None),
    constraints: str | None = Form(None, description="JSON list of strings"),
    tags: str | None = Form(None, description="JSON list of tag slugs (replaces existing)"),
    sample_io: str | None = Form(None, description="JSON object"),
    input_desc: str | None = Form(None),
    output_desc: str | None = Form(None),
    explanation: str | None = Form(None),
    memory_limit_mb: int | None = Form(None, gt=0),
    time_limit_sec: int | None = Form(None, gt=0),
    visibility: bool | None = Form(None),
    source: str | None = Form(None),
    editorial: str | None = Form(None),
    tests_zip: UploadFile | None = File(None, description="If given, REPLACES all testcases"),
    db: Session = Depends(get_db),
    current_user: User = Depends(oauth2.get_current_admin)
):
    """Course-correct an existing problem without a delete-and-recreate burn.

    Only the fields you send are changed. Sending tests_zip swaps the whole
    testcase set atomically: new cargo is uploaded first and the old cargo is
    jettisoned only after the database commit succeeds.
    """
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(detail="Problem with given ID not found", status_code=status.HTTP_404_NOT_FOUND)

    # Validate the JSON-encoded payloads before touching anything
    try:
        if constraints is not None:
            problem.constraints = ProblemArrayDataValidator(tags=[], constraints=json.loads(constraints), sample_io={}).constraints
        if sample_io is not None:
            problem.sample_io = ProblemArrayDataValidator(tags=[], constraints=[], sample_io=json.loads(sample_io)).sample_io
        new_slugs = ProblemArrayDataValidator(tags=json.loads(tags), constraints=[], sample_io={}).tags if tags is not None else None
    except (json.JSONDecodeError, ValidationError):
        db.rollback()
        raise HTTPException(detail="Invalid format for tags, constraints, or sample_io", status_code=status.HTTP_400_BAD_REQUEST)

    if new_slugs is not None:
        categories = db.query(Category).filter(Category.slug.in_(new_slugs)).all()
        if len(categories) != len(set(new_slugs)):
            db.rollback()
            raise HTTPException(detail="One or more tags are invalid", status_code=status.HTTP_400_BAD_REQUEST)
        problem.tags = categories

    scalar_updates = {
        "title": title, "description": description, "difficulty": difficulty,
        "input_desc": input_desc, "output_desc": output_desc, "explanation": explanation,
        "memory_limit_mb": memory_limit_mb, "time_limit_sec": time_limit_sec,
        "visibility": visibility, "source": source, "editorial": editorial,
    }
    for field, value in scalar_updates.items():
        if value is not None:
            setattr(problem, field, value)

    # Swap the testcase cargo, if a new manifest was supplied
    old_keys, new_keys = [], []
    if tests_zip is not None:
        cases = _extract_testcases(await tests_zip.read(), tests_zip.filename)
        old_keys = [k for tc in problem.testcases for k in (tc.input_key, tc.output_key)]
        try:
            new_rows = []
            for name, in_bytes, out_bytes in cases:
                in_key = get_storage_testcases().upload_bytes(problem_id=problem.id, filename=name, data=in_bytes)
                new_keys.append(in_key)
                out_key = get_storage_testcases().upload_bytes(problem_id=problem.id, filename=name, data=out_bytes)
                new_keys.append(out_key)
                new_rows.append(TestCase(problem_id=problem.id, input_key=in_key, output_key=out_key))
            problem.testcases = new_rows  # delete-orphan cascade retires the old rows
        except Exception:
            db.rollback()
            for key in new_keys:
                get_storage_testcases().delete_file(key)
            raise HTTPException(detail="Unknown Error Occurred", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    try:
        db.commit()
    except Exception:
        db.rollback()
        for key in new_keys:
            get_storage_testcases().delete_file(key)
        raise HTTPException(detail="Unknown Error Occurred", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Commit landed: safe to jettison the retired cargo
    for key in old_keys:
        try:
            get_storage_testcases().delete_file(key)
        except Exception:
            pass

    db.refresh(problem)
    return get_problem_by_id(problem.id, db, current_user)
