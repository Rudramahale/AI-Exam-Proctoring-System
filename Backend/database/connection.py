from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()
url = os.getenv("DATABASE_URL")

engine = create_engine(
    url,
    echo = True
)

Session = sessionmaker(
    autocommit=False,
    autoflush=False,    
    bind = engine
)

Base = declarative_base()
print("Connected successfully to the database")
