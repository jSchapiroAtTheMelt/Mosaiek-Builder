'use strict';
let bodyParser = require('body-parser');
let morgan = require('morgan');
let ParseCloud = require('parse-cloud-express');
let Parse = ParseCloud.Parse;
let Mosaic = require('../Mosaic/Mosaic.js');


module.exports = (app) => {

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(morgan('dev'));
  //app.use('/hooks', ParseCloud.app);
  
  app.post('/hooks/mosaiek/contribute',(req,res) => {
    
    
    new Mosaic('UI3wo4OfJ3',2,2,true);

    res.send('hello world');
  });

};

