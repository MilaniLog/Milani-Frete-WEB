process.chdir(__dirname);

require('dotenv').config({
  path: __dirname + '/.env',
});

require('./dist/src/main.js');
