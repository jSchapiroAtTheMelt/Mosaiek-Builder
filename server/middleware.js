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
  
  app.post('/hooks/mosaiek/mosaic',(req,res) => {
    
    res.send('new mosaic received');
  
  })

  app.post('/hooks/mosaiek/contribute',(req,res) => {
    
    
    //new Mosaic('UI3wo4OfJ3',40,40,true);

    res.send('new contribution made');
  });

};

