dist:
	rm -rf ./dist && \
	./node_modules/.bin/babel src --out-dir dist --ignore src/webconfig/public \
	&& cp -R ./src/webconfig/public ./dist/webconfig/public \
	&& cp -R ./src/webconfig/views ./dist/webconfig/views \
	&& cp -R ./src/instance ./dist/instance

start:
	./node_modules/.bin/babel-node

.PHONY: dist start
