'use strict';
let bodyParser = require('body-parser');
let morgan = require('morgan');
let ParseCloud = require('parse-cloud-express');
let Parse = ParseCloud.Parse;
let Mosaic = require('../Mosaic/Mosaic.js');
let Contribution = require('../Mosaic/Contribution.js');
let State = require('../Mosaic/State.js');
let client;


module.exports = (app) => {
  
  let server = require('http').Server(app);
  let io = require('socket.io')(server);
  let port = process.env.PORT || 5000
  let mosaicRooms = {}; //{mosaicID:[socket1,socket2]}
  let connectedSockets = [];

  server.listen(port); 

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(morgan('dev'));

  // Initialize Redis Client
  if (process.env.REDISTOGO_URL) {
      
      let rtg   = require("url").parse(process.env.REDISTOGO_URL);
      client = require("redis").createClient(rtg.port, rtg.hostname);

      client.auth(rtg.auth.split(":")[1]);

  } else {

      client = require("redis").createClient();
      
  }


  io.on('connection',function(socket){
    console.log('Middleware.js: Socket Connected')
    let connection = socket;

    if (connectedSockets.indexOf(socket.id) > -1){
      console.log("Middleware.js: Socket already connected, disconnecting ",socket.id)
      socket.disconnect();
    } else {
      console.log("Middleware.js: Socket: " + socket.id + "added to socket connections array")
      connectedSockets.push(socket.id);
    }

    socket.on('handshake',function(data){
      console.log('Middleware.js: Handshake Received - adding to device socket map',data)
      
      let connections = mosaicRooms[data];
      console.log("Middleware.js: connections ");
      
      if (connections === undefined){
        mosaicRooms[data] = [connection];
        console.log("Middleware.js: First connection to room ", data);
      } else {
        if (data in mosaicRooms) {
           mosaicRooms[data].push(connection);
        }
       
        console.log('Middleware.js: There are ' + connections.length + 'connections' + 'on ' + data);
        console.log('Middleware.js: Room: ',data);
        //console.log('Middleware.js: Connections: ',mosaicRooms[data]);
      }
      
      
    });

    socket.on('disconnect',function(data){
      //remove socket from mosaicrooms
      if (connectedSockets.indexOf(socket) > -1) {
        let socketIndex = connectedSockets.indexOf(socket);
        connectedSockets.splice(socketIndex,1);
      }
      if (mosaicRooms[data] !== undefined) {
        let roomIndex = mosaicRooms[data].indexOf(socket);
        mosaicRooms[data].splice(roomIndex,1);

        console.log("Middleware.js: Disconnecting from room ",data);
        socket.disconnect();
      }
    });
    
    socket.emit('handshake',{connection:true});

  })


  app.post('/hooks/mosaiek/mosaic',(req,res) => {
    //let mosaicId = req.body.object.objectId 
    let mosaicId = "2I7yKFw3JF"
    if (mosaicId) {
      new Mosaic(mosaicId,40,40,true,function(err,mosaic_map){
        if (mosaic_map) {
          res.status(200);
          res.send('new mosaic map made')
          console.log("FIN",mosaic_map);
        } else {
          res.status(400)
          res.send('unable to make new contribution', err)
        }
      });
    } else {
      res.status(400);
      res.send('unable to make new mosaic');
    }
  
  })

  app.post('/hooks/mosaiek/contribute',(req,res) => {
    
  
    let mosaicID = "2I7yKFw3JF"//req.body.object.mosaic.objectId; //448GSqKkkW
    let contributionID = "g6ZyM3cRa5"//req.body.object.objectId //UFySvKQlpX
    let contributionImageData = "http://files.parsetfss.com/55194c1d-1beb-471b-b879-72f6b95d608b/tfss-3e55e7e2-af92-4d55-9f20-054f05cb0f4d-image_thumbnail.jpeg"//req.body.object.thumbnail; //http://files.parsetfss.com/55194c1d-1beb-471b-b879-72f6b95d608b/tfss-3e55e7e2-af92-4d55-9f20-054f05cb0f4d-image_thumbnail.jpeg
    //let red = req.body.object.red;
    //let green = req.body.object.green;
    //let blue = req.body.object.blue;
    let rgb = [ 78, 66, 49 ]//[red,green,blue]; //

    console.log("Middleware.js/contribution: Mosaic Contribution ")
    console.log("------------------------------------")
    console.log("mosaicID: ",mosaicID);
    console.log("contribution id: ",contributionID);
    console.log('contribution image data',contributionImageData.url)
    console.log("RGB: ",rgb);
     console.log("------------------------------------")

    if (mosaicID && contributionID && contributionImageData && rgb.length === 3){

      res.status(200)
      res.send("Contribution data received")
      
      new Contribution(mosaicID,contributionID,rgb,contributionImageData,function(err,data,transformedImage,stateMap,complete){
        if (err) {
          console.log("Middleware.js/contribution: unable to make contribution: ",err);
          res.status(400);
          res.send("Middleware.js/contribution: unable to make contribution: " + err);
          io.emit('error',err);

        } else {
          //if (data !== undefined && data !== null && data.match(/\d/g) !== null){
           
            //data = data.match(/\d/g).join("");
            /*
            let mosaicImageMap = {
              mosaic:mosaicID,
              mosaicImage:contributionID,
              position:data,
              rgbImage:transformedImage
            }*/

            console.log("Middleware.js: New contribution made: ");
            
            let roomsToEmit = mosaicRooms[mosaicID];

            if (roomsToEmit !== undefined){
              for (let room in roomsToEmit){
                if (transformedImage !== undefined || transformedImage !== null){
                  roomsToEmit[room].emit('contribution', {mosaic:transformedImage});
                }
                
              }
            }
          //}

          //io.emit('contribution',mosaicImageMap);
          if (complete){
            console.log("Middleware.js: saving mosaic image contribution map to redis for ", mosaicID);
            client.set(mosaicID+'_contributions',JSON.stringify(stateMap));
          }
          
        
          /* Abandoning server side state for now
          new State(mosaicID,stateMap,function(){

          });*/

        }

      });
    
    } else {
      
      res.status(400);
      res.send('unable to make contribution')
    }
    

  });

};

