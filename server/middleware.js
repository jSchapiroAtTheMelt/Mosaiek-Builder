'use strict';
let bodyParser = require('body-parser');
let morgan = require('morgan');
let ParseCloud = require('parse-cloud-express');
let Parse = ParseCloud.Parse;
let Mosaic = require('../Mosaic/Mosaic.js');
let Contribution = require('../Mosaic/Contribution.js');
let State = require('../Mosaic/State.js');


module.exports = (app) => {
  
  let server = require('http').Server(app);
  let io = require('socket.io')(server);
  let port = process.env.PORT || 5000
  let mosaicRooms = {}; //{mosaicID:[socket1,socket2]}

  server.listen(port); 

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(morgan('dev'));

  io.on('connection',function(socket){
    console.log('socket connected!')
    let connection = socket;

    socket.on('handshake',function(data){
      console.log('handshake received')
      //console.log('socket',connection);
      console.log('data',data);
      let connections = mosaicRooms[data];
      
      if (connections === undefined){
        mosaicRooms[data] = [connection];
      } else {
        mosaicRooms[data].push(connection);
        console.log('there are ' + connections.length + 'connections' + 'on ' + data);
      }

      console.log("connections",mosaicRooms);
    });
    
    socket.emit('handshake',{connection:true});


  })





  app.post('/hooks/mosaiek/mosaic',(req,res) => {
    console.log("Retrieving mosaic_map for",req.body.object.objectId)
    let mosaicId = req.body.object.objectId 
    //let mosaicId = "448GSqKkkW"
    if (mosaicId) {
      new Mosaic(mosaicId,10,10,true,function(err,mosaic_map){
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
    
  
    let mosaicID = req.body.object.mosaic.objectId; //448GSqKkkW
    let contributionID = req.body.object.objectId //UFySvKQlpX
    let contributionImageData = req.body.object.thumbnail; //http://files.parsetfss.com/55194c1d-1beb-471b-b879-72f6b95d608b/tfss-3e55e7e2-af92-4d55-9f20-054f05cb0f4d-image_thumbnail.jpeg
    let red = req.body.object.red;
    let green = req.body.object.green;
    let blue = req.body.object.blue;
    let rgb = [red,green,blue]; //[ 78, 66, 49 ]

    console.log("MOSAIC IMAGE ")
    console.log("mosaicID: ",mosaicID);
    console.log("contribution id: ",contributionID);
    console.log('contribution image data',contributionImageData.url)
    console.log("RGB: ",rgb);

    if (mosaicID && contributionID && contributionImageData && rgb.length === 3){
      
      new Contribution(mosaicID,contributionID,rgb,contributionImageData,function(err,data,transformedImage,stateMap){
        if (err) {
          res.status(400);
          res.send("unable to make contribution")
          

        } else {

          console.log("data",data);

          let mosaicImageMap = {
            mosaic:mosaicID,
            mosaicImage:contributionID,
            position:data,
            rgbImage:transformedImage
          }

          io.emit('contribution',mosaicImageMap);
          res.status(200)
          res.send("new contribution made")

          new State(mosaicID,stateMap,function(){

          });
        }
      });
    
    } else {
      
      res.status(400);
      res.send('unable to make contribution')
    }
    

  });

};

