from database.connection import Base, engine
from models.students import Student

Base.metadata.create_all(bind = engine)
print("Table created successfully in database")
