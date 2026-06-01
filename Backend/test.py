from utils.Get_Image import get_image
from utils.presence_of_person import detect_person

image = get_image(session_id=5)  # Replace with actual session ID
result = detect_person(image)
print(result)