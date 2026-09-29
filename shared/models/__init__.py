from .user import User
from .submission import Submission
from .problem import Problem, Category, TestCase, Tag
from .enums import UserType, Difficulty, Verdict, Language

FILENAME = {
    Language.C: "main.c",
    Language.CPP: "main.cpp",
    Language.PYTHON: "main.py",
    Language.JAVASCRIPT: "main.js",
}

IMAGE = {
    Language.C: "judge-gcc:latest",
    Language.CPP: "judge-gcc:latest",
    Language.PYTHON: "judge-python:latest",
    Language.JAVASCRIPT: "judge-node:latest",
}

EXTENSIONS = {
    Language.C: "c",
    Language.CPP: "cpp",
    Language.PYTHON: "py",
    Language.JAVASCRIPT: "js",
}
