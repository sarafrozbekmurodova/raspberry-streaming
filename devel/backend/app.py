#!/usr/bin/env python3
# app.py
# sources:
#   https://flask.palletsprojects.com/en/stable/quickstart/
#   https://flask.palletsprojects.com/en/stable/deploying/nginx/
#   https://flask.palletsprojects.com/en/stable/patterns/sqlite3/
import os
import uuid
import sqlite3
import shutil
import subprocess
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, redirect
from concurrent.futures import ThreadPoolExecutor
from werkzeug.utils import secure_filename

# --- config ---
BASE_MEDIA_DIR = Path('/var/www/pi_streamer/media')
ORIG_DIR = BASE_MEDIA_DIR / 'original'
HLS_DIR = BASE_MEDIA_DIR / 'hls'
DB_PATH = Path('/home/hardik/pi_streamer_backend/media.db')
ALLOWED_EXT = {'.mp4', '.mkv'}
MAX_FILE_SIZE = 2 * 2**30 * 8 # 4GiB limit
FFMPEG_CMD_TEMPLATE = (
    'ffmpeg -y -i "{infile}" '
    '-c:v libx264 -profile:v baseline -preset veryfast -crf 23 -g 48 -keyint_min 48 -sc_threshold 0 '
    '-c:a aac -b:a 128k '
    '-f hls -hls_time 6 -hls_list_size 0 '
    '-hls_segment_filename "{outdir}/segment_%03d.ts" "{outdir}/playlist.m3u8"'
)
MAX_WORKERS = 1  # keep low

# --- ensure dirs ---
for d in (BASE_MEDIA_DIR, ORIG_DIR, HLS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# --- DB helpers ---
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY,
            filename TEXT,
            original_path TEXT,
            hls_path TEXT,
            status TEXT,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def db_insert(entry):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO media (id, filename, original_path, hls_path, status, message)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (entry['id'], entry['filename'], entry['original_path'], entry['hls_path'], entry['status'], entry['message']))
    conn.commit()
    conn.close()

def db_update_status(mid, status, message=''):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('UPDATE media SET status=?, message=? WHERE id=?', (status, message, mid))
    conn.commit()
    conn.close()

def db_get_all():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, filename, status, message, hls_path, created_at FROM media ORDER BY created_at DESC')
    rows = c.fetchall()
    conn.close()
    return rows

def db_get(mid):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, filename, status, message, hls_path FROM media WHERE id=?', (mid,))
    row = c.fetchone()
    conn.close()
    return row

# --- transcode job ---
def transcode_to_hls(mid, infile_path, outdir):
    try:
        db_update_status(mid, 'processing', 'Transcoding started')
        outdir.mkdir(parents=True, exist_ok=True)
        cmd = FFMPEG_CMD_TEMPLATE.format(infile=str(infile_path), outdir=str(outdir))
        # Run ffmpeg and capture output
        proc = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if proc.returncode != 0:
            db_update_status(mid, 'failed', f'ffmpeg error: {proc.stderr[:400]}')
            return
        # success
        db_update_status(mid, 'ready', '')
    except Exception as e:
        db_update_status(mid, 'failed', str(e))

# --- Flask app ---
app = Flask(__name__)
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

# limit size (Flask doesn't enforce by default)
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

init_db()

@app.route('/api/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'no file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'no selected file'}), 400
    filename = secure_filename(file.filename)
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return jsonify({'error': 'file type not allowed'}), 400

    mid = uuid.uuid4().hex
    saved_name = f"{mid}{ext}"
    saved_path = ORIG_DIR / saved_name
    file.save(saved_path)

    hls_out_dir = HLS_DIR / mid
    entry = {
        'id': mid,
        'filename': filename,
        'original_path': str(saved_path),
        'hls_path': f'/hls/{mid}/playlist.m3u8',
        'status': 'queued',
        'message': ''
    }
    db_insert(entry)

    # schedule background transcode
    executor.submit(transcode_to_hls, mid, saved_path, hls_out_dir)

    return jsonify({'id': mid, 'status_url': f'/api/status/{mid}', 'play_url': f'/watch/{mid}'}), 202

@app.route('/api/media', methods=['GET'])
def media_list():
    rows = db_get_all()
    res = [{
        'id': r[0], 'filename': r[1], 'status': r[2], 'message': r[3], 'hls_path': r[4], 'created_at': r[5]
    } for r in rows]
    return jsonify(res)

@app.route('/api/status/<mid>', methods=['GET'])
def status(mid):
    r = db_get(mid)
    if not r:
        return jsonify({'error': 'not found'}), 404
    return jsonify({'id': r[0], 'filename': r[1], 'status': r[2], 'message': r[3], 'hls_path': r[4]})

@app.route('/watch/<mid>')
def watch(mid):
    r = db_get(mid)
    if not r:
        return "Not found", 404
    # redirect to the nginx-served HLS playlist path
    return redirect(r[4])

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8080, debug=True)
