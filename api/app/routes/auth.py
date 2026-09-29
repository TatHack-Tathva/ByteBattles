from fastapi import APIRouter, Depends, status, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError


from ..schemas.user import UserCreate, UserResponse, RefreshAccessTokenRequest, TokenPayload

from ..utils import password_manager, oauth2
from ..database import get_db

from shared.models import User

from config import DUMMY_PASS

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

DUMMY_PASSWORD = password_manager.hash(DUMMY_PASS)

@router.post('/register', status_code=status.HTTP_201_CREATED, response_model=UserResponse)
def register(user_data: UserCreate, db: Session = Depends(get_db)):

    if (user_data.password != user_data.conf_password):
        raise HTTPException(detail="confirm password and given password don't match", status_code=status.HTTP_400_BAD_REQUEST)

    user = db.query(User).filter(
        or_(User.username == user_data.username, User.email == user_data.email)
    ).first()
    
    if user:
        raise HTTPException(detail="user with this username or email already exists", status_code=status.HTTP_409_CONFLICT)
    
    hashed_password = password_manager.hash(user_data.password)
    db_user = User(username=user_data.username, email=user_data.email, password_hash=hashed_password)
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            detail="user with this username or email already exists",
            status_code=status.HTTP_409_CONFLICT
        )

    return db_user

@router.post('/login', status_code=status.HTTP_200_OK)
def login(cred: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):

    user = db.query(User).filter(
        or_(User.username == cred.username, User.email == cred.username)
    ).first()
    
    if not user:
        password_manager.verify(cred.password, DUMMY_PASSWORD)
        raise HTTPException(
            detail="Invalid username or password", 
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not password_manager.verify(cred.password, user.password_hash):
        raise HTTPException(
            detail="Invalid username or password",
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )
    
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
    access_token = oauth2.refresh_access_token(token.refresh_token)
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }
