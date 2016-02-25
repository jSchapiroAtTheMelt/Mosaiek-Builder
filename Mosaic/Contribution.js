//https://github.com/lokesh/color-thief/
'use strict';
let Parse = require('parse/node');
let im = require('imagemagick');
let gm = require('gm');
let fs = require('fs');
let http = require('http');                                              
let  Stream = require('stream').Transform;
let sm = require('simple-imagemagick');
let exec = require("child_process").execFile;
let remove = require('remove');
let mkdirp = require('mkdirp');

let client;

Parse.initialize("OEzxa2mIkW4tFTVqCG9aQK5Jbq61KMK04OFILa8s", "6UJgthU7d1tG2KTJevtp3Pn08rbAQ51IAYzT8HEi");


class Contribution {
  //get mosaic_map for contribution's mosaic
  //compare avg rgb of contribution to each tile in mosaic_map
  //determine best fit
  //layer on top of mosaic
  //update db

  constructor(main_mosaic_filename,contributed_filename,rgb,contributedImageData,callback) {
    this.main_mosaic_filename = main_mosaic_filename; //mosaic objectId
    this.contributed_filename = contributed_filename; //mosaicImage objectId
    this.contributedImageData = contributedImageData; //mosaicImage thumbnail url
    this.mosaic_map = []; // retrieved from redis
    this.mosaic_cells = 0;
    this.mosaic_rows = 0;
    this.rgb = rgb;  //array of rgb values
    this.width = 0;
    this.height = 0;

    this.get_mosaic_map()
  }

  get_mosaic_map(){
    //read map from redis -> json parse -> store as instance property
    let self = this;

    if (process.env.REDISTOGO_URL) {
        
        let rtg   = require("url").parse(process.env.REDISTOGO_URL);
        client = require("redis").createClient(rtg.port, rtg.hostname);

        client.auth(rtg.auth.split(":")[1]);

    } else {

        client = require("redis").createClient();
        console.log('here')
    }

    //get mosaic map
    client.get(this.main_mosaic_filename,function(err,data){
      
      if (err){console.log("Error while retrieving the mosaic map",err);}
      else {

        self.mosaic_map = JSON.parse(data);

        //get cell height and width
        client.get(self.main_mosaic_filename + "_dimens",function(err,data){
          
          if (err){console.log("Error while getting mosaics dimens",err);}
          else {
            let dimens = JSON.parse(data);
            
            self.width = dimens[0];
            self.height = dimens[1];

            
            self.get_main_mosaic_image();

          }
        })
      }
    });
    //make http request to get image data
    //resize image to mosaic maps cell size
    //write to file system
  }

  get_main_mosaic_image(cb){
    let Mosaic = Parse.Object.extend("Mosaic");
    let mosaicQuery = new Parse.Query(Mosaic);
    let self = this;
    console.log("retrieiving main mosaic image",self.main_mosaic_filename)

    mosaicQuery.get(self.main_mosaic_filename , {
      success: function(mosaic) {
        console.log("Main Mosaic Image Received: ", mosaic);
        
        //store image locally                 
        http.request(mosaic.get('image').url(), function(response) {                                        
          let data = new Stream();                                                    

          response.on('data', function(chunk) {                                       
            data.push(chunk);                                                         
          });                                                                         

          response.on('end', function() {                                             
            try {
              // read main mosaic image from file system.
              fs.writeFileSync('temp/'+ self.main_mosaic_filename +'.jpg', data.read());  
              
              mkdirp('temp/mosaic_image', function(err) { 
                  if (err){
                    console.log("Error while creating temp/mosaic_image",err);
                   
                  } else {
                    
                    self.resize_mosaic_image();

                  }
                  // path was created unless there was error
                  console.log('race against the clock')
              });
              //get main image stats
              console.log('Gathering statistics about main mosaic image...');
              
            } catch (e) {
              
              console.log("Error while getting image stats", e);

            } 

          });                                                                         
        }).end();
       
      },

      error: function(object, error) {
        
        console.log('error',error)
      }
    });
  }

  resize_mosaic_image() {
    let self = this;
    console.log("Retrieving image from", self.contributedImageData)
    http.request(self.contributedImageData, function(response) {                                        
      let data = new Stream();                                                    

      response.on('data', function(chunk) {                                       
        data.push(chunk);                                                         
      });                                                                         

      response.on('end', function() {                                             
        try {
          // read main mosaic image from file system.
          fs.writeFileSync('temp/mosaic_image/'+ self.contributed_filename +'.jpg', data.read());  
          
          
          //get main image stats
          console.log('done writing mosaic image to temp/mosaic_image');
          console.log('Attempting to resize it...')
          gm('temp/mosaic_image/'+self.contributed_filename +'.jpg').resize(self.width,self.height).write('temp/mosaic_image/'+self.contributed_filename +'.jpg',function(){
            console.log('finished resizing ','temp/mosaic_image/'+self.contributed_filename +'.jpg')
            self.match_avg_rgb();
          });
          
        } catch (e) {
          
          console.log("Error while getting image stats", e);

        } 

      });                                                                         
    }).end();
  }

  match_avg_rgb(){
    let self = this;
    //loop through each value in mosaic map and pass to is a match
    console.log('comparing mosaic image to mosaic map',self.mosaic_map);
    let bestMatch = '' //mosaic-tile name
    let bestMatchDiff = -1; //diff between rgb vals

    for (let tile in self.mosaic_map){
      //current tiles rgb
      let tileRGB = self.mosaic_map[tile][1];
      let tileRed = parseInt(tileRGB[0]);
      let tileGreen = parseInt(tileRGB[1]);
      let tileBlue = parseInt(tileRGB[2]);

      //mosaic image rgb
      let imageRGB = self.rgb;
      let imageRed = self.rgb[0];
      let imageGreen = self.rgb[1];
      let imageBlue = self.rgb[2];

      //RGB Diffs
      let redDiff = Math.abs(tileRed - imageRed);
      let greenDiff = Math.abs(tileGreen - imageGreen);
      let blueDiff = Math.abs(tileBlue - imageBlue); 
      
      let currentDiff = redDiff + greenDiff + blueDiff;
      //bestMatchDiff not set
      if (bestMatchDiff === -1) {
        bestMatchDiff = currentDiff;
        bestMatch = self.mosaic_map[tile][0];
      } 

      if (currentDiff < bestMatchDiff) {
        bestMatchDiff = currentDiff;
        bestMatch = self.mosaic_map[tile][0];
      }

    }
    console.log('current images rgb',self.rgb)
    console.log('Best Match Diff', bestMatch)
  }

  is_a_match(contributionRGB,tileRGB){

  }

  add_to_mosaic(){

  }

  update_db(){

  }
}

module.exports = Contribution;