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
    console.log("Retrieving mosaic_map for",req.body.object.objectId)
    let mosaicId = req.body.object.objectId 
   
    if (mosaicId) {
      new Mosaic(mosaicId,20,20,true,function(err,mosaic_map){
        if (mosaic_map) {
          res.status(200);
          res.send('new mosaic map made')
        } else {
          res.status(400)
          res.send('unable to make new contribution')
        }
      });
    } else {
      res.status(400);
      res.send('unable to make new mosaic');
    }
   
    
  
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

