.PHONY:

build-sass: build-content build-popup

build-content:
	yarn run sass src/styles/content_script.scss:dist/content_script.css
build-popup:
	yarn run sass src/styles/popup.scss:dist/popup.css
	
watch-content:
	yarn run sass --watch src/styles/content_script.scss:dist/content_script.css &
watch-popup:
	yarn run sass --watch src/styles/popup.scss:dist/popup.css &
watch-sass: watch-popup watch-content

watch: build-sass watch-sass
	npm run watch

build: build-sass
	npm run build

zip:
	rm -f u2f-chrome.zip; cd dist && zip ../u2f-chrome.zip -r *


build-dist: build zip
