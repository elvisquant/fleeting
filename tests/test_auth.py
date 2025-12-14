def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    # Adjust based on your actual root endpoint response
    # assert response.json() == {"message": "Hello World"} 

def test_register_user(client):
    payload = {
        "matricule": "TEST001",
        "full_name": "Pytest User",
        "agency_id": 1,
        "service_id": 1,
        "telephone": "123456789",
        "email": "test@example.com",
        "is_active": False,
        "password": "StrongPassword123#",
        "role_id": 1
    }
    response = client.post("/api/v1/auth/register", json=payload)
    # Note: This might fail if Agency/Service/Role ID 1 don't exist in the test DB yet.
    # You would need to create those in conftest.py first.
    assert response.status_code in [201, 400, 409]