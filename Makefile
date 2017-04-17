dist:
	./node_modules/.bin/babel src --out-dir dist --ignore src/webconfig/public \
	&& cp -R ./src/webconfig/public ./dist/webconfig/public

start:
	./node_modules/.bin/babel-node

.PHONY: dist start
