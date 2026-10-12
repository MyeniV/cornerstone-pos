FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py test_app.py ./
RUN python -m unittest test_app.py
USER 10001
EXPOSE 9108
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:9108/healthz', timeout=2)"
CMD ["python", "app.py"]
