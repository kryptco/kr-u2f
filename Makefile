.PHONY:

build-sass: build-content build-popup

build-content:
	yarn run sass src/styles/content_script.scss:dist/chromium/content_script.css
	yarn run sass src/styles/content_script.scss:dist/firefox/content_script.css
build-popup:
	yarn run sass src/styles/popup.scss:dist/chromium/popup.css
	yarn run sass src/styles/popup.scss:dist/firefox/popup.css
	
watch-content:
	yarn run sass --watch src/styles/content_script.scss:dist/chromium/content_script.css &
	yarn run sass --watch src/styles/content_script.scss:dist/firefox/content_script.css &
watch-popup:
	yarn run sass --watch src/styles/popup.scss:dist/chromium/popup.css &
	yarn run sass --watch src/styles/popup.scss:dist/firefox/popup.css &
watch-sass: watch-popup watch-content

watch: build-sass watch-sass
	npm run watch

build: build-sass
	npm run build

zip:
	rm -f u2f-chrome.zip; cd dist/chromium && zip ../../u2f-chrome.zip -r *


build-dist: build zip
