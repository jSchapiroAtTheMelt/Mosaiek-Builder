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
    console.log(req.body)
    new Mosaic('UI3wo4OfJ3',40,40,true,function(success){
      if (success) {

        res.send('new contribution made')
      } else {
        res.send('unable to make new contribution')
      }
    });
    
  
  })

  app.post('/hooks/mosaiek/contribute',(req,res) => {
    
    console.log(req.body)
    /*new Mosaic('UI3wo4OfJ3',40,40,true,function(success){
      if (success) {

        res.send('new contribution made')
      } else {
        res.send('unable to make new contribution')
      }
    });*/

    res.send('new contribution made');
  });

};

