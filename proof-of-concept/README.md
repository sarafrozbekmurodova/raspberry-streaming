# raspberry-streaming

## Proof of concept - steps taken:

- ### install packages:
    ```
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y nginx ffmpeg
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

- ### generate HLS segments:
    - simple example:
    ```
    wget -O BigBuckBunny.mp4 "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4"
    ffmpeg -i BigBuckBunny.mp4 \
    -profile:v baseline -level 3.0 -s 640x360 -start_number 0 \
    -hls_time 10 -hls_list_size 0 -f hls \
    /var/www/pi_streamer/media/hls/bbb.m3u8
    ```

- ### html/landing page:
    - copy html file to `/var/www/pi_streamer/media/player.html`
