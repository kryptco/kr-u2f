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

zip-chromium:
	rm -f u2f-chromium.zip; cd dist/chromium && zip ../../u2f-chromium.zip -r *

zip-firefox:
	rm -f u2f-firefox.zip; cd dist/firefox && zip ../../u2f-firefox.zip -r *

zip: zip-chromium zip-firefox

build-dist: build zip
