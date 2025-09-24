# raspberry-streaming

## Proof of concept - steps taken:

- ### install packages:
    ```
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y nginx ffmpeg python3 python3-pip
    ```

- ### set up directories:
    ```
    sudo mkdir -p /var/www/pi_streamer/media/
    sudo chown -R "$(id -u):$(id -g)" /var/www/pi_streamer
    ```

- ### configure nginx:
    - copy nginx config file to `/etc/nginx/sites-available/pi_streamer`
    - remove `default` config file found in `/etc/nginx/sites-enabled/`
    - ```
      sudo ln -s /etc/nginx/sites-available/pi_streamer /etc/nginx/sites-enabled/
      sudo nginx -t && sudo systemctl reload nginx
      ```
    - new config also sets up endpoints for backend
    - always execute the following after chaning config of nginx: `sudo nginx -t && sudo systemctl reload nginx`

- ### set up backend:
    - ```
      mkdir ~/pi_streamer_backend
      ```
    - copy `app.py` and `requirements.txt` into that dir
    - ```
      python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
      ```
    - finally, run the app as such: `python app.py`
    - uploads are saved to /var/www/pi_streamer/media/original/<id>.ext
    - a DB row is created with status queued
    - a background worker runs ffmpeg to create HLS in /var/www/pi_streamer/media/hls/<id>/playlist.m3u8
    - nginx serves /hls/<id>/playlist.m3u8 and segments to clients
    - the /api/status/<id> endpoint shows progress (queued -> processing -> ready/failed)

- ### frontend/landing page:
    - copy all relevant html/css/js files to `/var/www/pi_streamer/media/`
    - #### index.html + index.js
        - Main app page where users interact with Pi Streamer
        - upload new videos to the Raspberry Pi
        - show a list of uploaded videos
        - upload logic: use fetch/FormData to send files to /api/upload.
        Updates the progress bar during upload
        - List rendering: Calls /api/list to fetch all uploaded videos, then
        dynamically creates <div> items for each one
        - Open in player: A button links to /player.html?id=<video-id> so the
        user can open that video in a dedicated player
    - #### player.html + player.js
        - Standalone player page
        - Button to go “Back to Library”
        - Read the `?id=<video-id>` query parameter from the URL
        - Construct the HLS URL `/hls/<id>/playlist.m3u8`
        - Create a <video> element
        - If the browser supports HLS natively (Safari), set `video.src`
        - Otherwise use hls.js to attach the stream
