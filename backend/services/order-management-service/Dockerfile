# 1. Base Image (Official Python Slim)
FROM python:3.11-slim

# 2. Set Environment Variables
# Prevents Python from buffering stdout (logs appear immediately in CloudWatch)
ENV PYTHONUNBUFFERED=1

# 3. Work Directory
WORKDIR /code

# 4. Install system deps for confluent-kafka (librdkafka)
RUN apt-get update && apt-get install -y --no-install-recommends gcc librdkafka-dev && rm -rf /var/lib/apt/lists/*

# 5. Install Dependencies
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# 5. Copy Source Code
COPY ./app /code/app

# 6. Run the Application
# Uses 'app.main:app' as the entry point, listening on port 80
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
