#!/bin/bash
# Deploy test pages to kreathaus.com/2026/test/ via FTP
# Deploys: index, play, diff, creators, intelligence, partnerships + assets

FTP_HOST="ftp.kreathaus.com"
FTP_USER="jbowden@kreathaus.com"
FTP_PASS='Anewplay2614$$'
REMOTE_DIR="/public_html/2026/test"

cd "$(dirname "$0")"
echo "Deploying test pages to $FTP_HOST$REMOTE_DIR..."

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

lftp <<DEPLOY_EOF
  set ssl:verify-certificate no
  set ftp:ssl-allow yes
  set net:timeout 30
  open -u "$FTP_USER","$FTP_PASS" "$FTP_HOST"
  mkdir -p $REMOTE_DIR
  mkdir -p $REMOTE_DIR/images
  mkdir -p $REMOTE_DIR/images/intelligence
  mkdir -p $REMOTE_DIR/images/partnerships
  mkdir -p $REMOTE_DIR/images/creators_v2

  # Upload HTML pages
  put index.html -o $REMOTE_DIR/index.html
  put play.html -o $REMOTE_DIR/play.html
  put diff.html -o $REMOTE_DIR/diff.html
  put creators.html -o $REMOTE_DIR/creators.html
  put intelligence.html -o $REMOTE_DIR/intelligence.html
  put partnerships.html -o $REMOTE_DIR/partnerships.html

  # Upload stylesheet
  put styles.css -o $REMOTE_DIR/styles.css

  # Upload all images
  mirror --reverse --verbose --only-newer \
    images $REMOTE_DIR/images

  quit
DEPLOY_EOF

echo ""
echo "Deploy complete! Visit https://kreathaus.com/2026/test/"
