'use strict';
//https://github.com/lokesh/color-thief/
let Parse = require('parse/node');
let im = require('imagemagick');
let gm = require('gm');
let fs = require('fs');
let http = require('http');                                              
let  Stream = require('stream').Transform;
let sm = require('simple-imagemagick');
let exec = require("child_process").execFile;
let mkdirp = require('mkdirp');
let remove = require('remove');

Parse.initialize("OEzxa2mIkW4tFTVqCG9aQK5Jbq61KMK04OFILa8s", "6UJgthU7d1tG2KTJevtp3Pn08rbAQ51IAYzT8HEi");

class State {
  
  constructor(mainMosaicID,mosaicImageMap,callback){
    this.mainMosaicID = mainMosaicID;
    this.mosaicImageMap = mosaicImageMap;

    this.get_main_mosaic();
  }

  //get main mosaic image
  get_main_mosaic(){
    let Mosaic = Parse.Object.extend("Mosaic");
    let mosaicQuery = new Parse.Query(Mosaic);
    let self = this;
    console.log("State.js: retrieiving mosaic image",self.mainMosaicID);

    mosaicQuery.get(self.mainMosaicID , {
      success: function(mosaic) {
        console.log(" Mosaic Image Received: ", mosaic);
        
        //store image locally                 
        http.request(mosaic.get('image').url(), function(response) {                                        
          let data = new Stream();                                                    

          response.on('data', function(chunk) {                                       
            data.push(chunk);                                                         
          });                                                                         

          response.on('end', function() {                                             
            try {
              // read main mosaic image from file system.
              fs.writeFileSync('temp/state/'+ self.mainMosaicID +'.jpg', data.read());  
              
              console.log('beggining layering of mosaicImages');
              self.get_mosaic_images();

              
            } catch (e) {
              
              console.log("State.js: Error while getting main mosaic image", e);

            } 

          });                                                                         
        }).end();
       
      },

      error: function(object, error) {
        
        console.log('error',error)
      }
    });
  }

  get_mosaic_images(){

    let MosaicImage = Parse.Object.extend("MosaicImage");
    let mosaicImageQuery = new Parse.Query(MosaicImage);
    let self = this;
    let count = 0;

    for (let mi in self.mosaicImageMap) {
      mosaicImageQuery.get(self.mosaicImageMap[mi][1] , {
        success: function(mosaicImage) {
          console.log(" Mosaic Image Received: ", mosaicImage);
          
          //store image locally                 
          http.request(mosaicImage.get('image').url(), function(response) {                                        
            let data = new Stream();                                                    

            response.on('data', function(chunk) {                                       
              data.push(chunk);                                                         
            });                                                                         

            response.on('end', function() {                                             
              try {
                // read main mosaic image from file system.
                fs.writeFileSync('temp/state/mosaic_images/'+ self.mosaicImageMap[mi][1] +'.jpg', data.read());  
                
                console.log('Count:',count);
                console.log('Target Count:',self.mosaicImageMap.length)
                
                count++;

                if (count === self.mosaicImageMap.length){
                  console.log('beggining layering of mosaicImages');
                  self.layer_mosaic_images();
                }
                
              } catch (e) {
                
                console.log("State.js: Error while getting main mosaic image", e);

              } 

            });                                                                         
          }).end();
         
        },

        error: function(object, error) {
          
          console.log('error',error)
        }
      });
    }

    
  }

  //layer all images in the mosaicImageMap into the main mosaic image
  layer_mosaic_images(){
    console.log('State.js: layer mosaic images')
    let self = this;
    let layerFunctions = [];

    let base = function(){
      return  gm().in('-page', '+0+0').in('temp/state/'+ self.mainMosaicID +'.jpg')
    }
    
    let layerImage = function(coords,imagePath){
      
      let xCoord = "+" + coords[0].toString();
      let yCoord = "+" + coords[1].toString();
      let coordString = xCoord + yCoord;

      return function(gm){
        return function() {
          gm().in('-page',coordString).in(imagePath.toString());
        }
      };
    }

    for (let mosaicImage in self.mosaicImageMap){
      console.log("mosaic image",self.mosaicImageMap[mosaicImage]);
      let position = parseInt(self.mosaicImageMap[mosaicImage][0]);
      let path = 'temp/state/mosaic_images/' + self.mosaicImageMap[mosaicImage][1].toString();
      console.log('calling base with ',position,path);
      let layer = layerImage([getXPostion(position),getYPostion(position)],path);

      base = layer(base);
    }

    base.mosaic().write('temp/state/' + self.mainMosaicID + '_state.jpg',function(err){
      if (err) {console.log('error while layering images',e);}
      else {
        console.log('final state written to temp/state/')
      }
    });

    /*gm()
     .in('-page', '+0+0')
     .in('temp/state/'+ self.mainMosaicID +'.jpg')
     .in('-page', '+10+20') // location of smallIcon.jpg is x,y -> 10, 20
     .in('smallIcon.jpg')
     .mosaic()
     .write('tesOutput.jpg', function (err) {
        if (err) console.log(err);
     });*/
  }

  //store in parse in state field
  store_state_in_parse(){
    //read from fs
    //store in parse for that mosaic id
  }

  clean_up(){
    //remove temp/mosaic_image
  }

}

function getPostion(){

}

function getXPostion(position){
  return position % 10;
}

function getYPostion(position){
  return position/10;
}

module.exports = State;