import secrets
from sqlalchemy import text
from fastapi import APIRouter, Depends, status, HTTPException
from fastapi.security.oauth2 import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..schemas.user import UserCreate, UserResponse, RefreshAccessTokenRequest, TokenPayload

from ..utils import password_manager, oauth2
from ..database import get_db

from shared.models import User, UserType

from config import DUMMY_PASS, ADMIN_BOOTSTRAP_TOKEN

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

DUMMY_PASSWORD = password_manager.hash(DUMMY_PASS)

@router.post('/register', status_code=status.HTTP_201_CREATED, response_model=UserResponse)
def register(new_user: UserCreate, db: Session = Depends(get_db)):

    if (new_user.password != new_user.conf_password):
        raise HTTPException(detail="confirm password and given password don't match", status_code=status.HTTP_400_BAD_REQUEST)

    user = db.query(User).filter(User.username == new_user.username).first()
    if not user:
        user = db.query(User).filter(User.email == new_user.email).first()
    
    if user:
        raise HTTPException(detail="user with this username or email already exists", status_code=status.HTTP_409_CONFLICT)
    
    hashed_password = password_manager.hash(new_user.password)
    new_user = User(username=new_user.username, email=new_user.email, password_hash=hashed_password)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

@router.post('/login', status_code=status.HTTP_200_OK)
def login(cred: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):

    user = db.query(User).filter(User.username == cred.username).first()
    if not user:
        user = db.query(User).filter(User.email == cred.username).first()
    
    if not user:
        password_manager.verify(cred.password, DUMMY_PASSWORD)
        raise HTTPException(detail="Invalid username or password", status_code=status.HTTP_401_UNAUTHORIZED)
    
    if not password_manager.verify(cred.password, user.password_hash):
        raise HTTPException(detail="Invalid username or password", status_code=status.HTTP_401_UNAUTHORIZED)
    
    payload = TokenPayload(
        sub=user.id,
    )
    
    access_token = oauth2.create_access_token(payload)
    refresh_token = oauth2.create_refresh_token(payload)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post('/refresh', status_code=status.HTTP_200_OK)
def refresh(token: RefreshAccessTokenRequest):
    refresh_token = token.refresh_token
    access_token = oauth2.refresh_access_token(refresh_token)
    return {
        "access_token": access_token
    }


@router.post('/bootstrap-admin', status_code=status.HTTP_200_OK)
def bootstrap_admin(launch_code: str, current_user: User = Depends(oauth2.get_current_user), db: Session = Depends(get_db)):
    """One-shot ignition: crown the FIRST commander of the fleet.

    Works only while zero admins exist AND the caller presents the launch code
    from ADMIN_BOOTSTRAP_TOKEN. After the first success it seals itself shut.
    """
    if not ADMIN_BOOTSTRAP_TOKEN:
        raise HTTPException(detail="Admin bootstrap is disabled", status_code=status.HTTP_404_NOT_FOUND)

    # Serialize concurrent ignition attempts so two pilots can't both claim the chair
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(7331)"))

    if db.query(User).filter(User.user_type == UserType.ADMIN).first():
        raise HTTPException(detail="Command deck is already staffed", status_code=status.HTTP_409_CONFLICT)

    if not secrets.compare_digest(launch_code.encode(), ADMIN_BOOTSTRAP_TOKEN.encode()):
        raise HTTPException(detail="Invalid launch code", status_code=status.HTTP_403_FORBIDDEN)

    current_user.user_type = UserType.ADMIN
    db.commit()
    return {"detail": f"{current_user.username} promoted to ADMIN"}
