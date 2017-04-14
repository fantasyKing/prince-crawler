dist:
	./node_modules/.bin/babel src --out-dir dist

start:
	./node_modules/.bin/babel-node src/index.js

.PHONY: dist start
