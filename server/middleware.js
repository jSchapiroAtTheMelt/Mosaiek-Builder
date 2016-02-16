'use strict';
let bodyParser = require('body-parser');
let morgan = require('morgan');
let ParseCloud = require('parse-cloud-express');
let Parse = ParseCloud.Parse;


module.exports = (app) => {
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(morgan('dev'));
  app.use('/hooks', ParseCloud.app);
  
  app.post('/hooks/mosaiek/contribute',(req,res) => {
    console.log('req.body',req.body)
    res.send('hello world');
  });

};

