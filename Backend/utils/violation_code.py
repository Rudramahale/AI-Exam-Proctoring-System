def get_violation_code(violation_type:str):
    if violation_type == "tab_switch":
        return 1001
    elif violation_type == "face_not_detected":
        return 1002
    elif violation_type == "MULTIPLE_FACES_DETECTED":
        return 1003
    elif violation_type == "PHONE_DETECTED":
        return 1004
    elif violation_type == "FULLSCREEN_EXIT":
        return 1005
    elif violation_type == "FACE_MISMATCH":  
        return 1006  
    elif violation_type == "CAMERA_BLOCKED":
        return 1007 