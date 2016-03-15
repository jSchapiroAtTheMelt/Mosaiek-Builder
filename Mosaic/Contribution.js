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
let _ = require('underscore');

let client;

Parse.initialize("OEzxa2mIkW4tFTVqCG9aQK5Jbq61KMK04OFILa8s", "6UJgthU7d1tG2KTJevtp3Pn08rbAQ51IAYzT8HEi");

// Initialize Redis Client
if (process.env.REDISTOGO_URL) {
    
    let rtg   = require("url").parse(process.env.REDISTOGO_URL);
    client = require("redis").createClient(rtg.port, rtg.hostname);

    client.auth(rtg.auth.split(":")[1]);

} else {

    client = require("redis").createClient();
    
}

class Contribution {

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
    this.callback = callback;

    this.get_mosaic_map()
  }

  get_mosaic_map(){
    let self = this;

    //get mosaic map
    console.log("Contribution.js: Retrieiving Main Mosaic Map");
    client.get(this.main_mosaic_filename,function(err,data){
      
      console.log("Contribution.js: Successfully retrieved Main Mosaic Map");
      
      if (err){console.log("Error while retrieving the mosaic map",err);}
      else {

        self.mosaic_map = JSON.parse(data);

        //get cell height and width of tiles in main mosaic
        console.log("Contribution.js: Retrieiving Main Mosaic Map Cell Dimensions");
        client.get(self.main_mosaic_filename + "_dimens",function(err,data){
          
          if (err){console.log("Error while getting mosaics dimens",err);}
          else {
            console.log("Contribution.js: Successfully retrieved main mosaic map cell dimensions");
            let dimens = JSON.parse(data);
            
            self.width = dimens[0];
            self.height = dimens[1];

            self.get_main_mosaic_image();

          }
        })
      }
    });
  
  }

  //may be unecessary!!!! **********
  get_main_mosaic_image(cb){
    let Mosaic = Parse.Object.extend("Mosaic");
    let mosaicQuery = new Parse.Query(Mosaic);
    let self = this;

    console.log("Contribution.js: Retrieving Main Mosaic  Object")
    mosaicQuery.get(self.main_mosaic_filename , {
      success: function(mosaic) {
        console.log("Contribution.js: Contribution Mosaic Object Received: ", mosaic);
        
        //get image data for main mosaic object
        console.log("Contribution.js: Retrieving Main Mosaic Image")                
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
                  
              });
              //get main image stats
              console.log('Gathering statistics about main mosaic image...');
              
            } catch (e) {
              self.callback(e,null);
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
    console.log("Contribution.js: Retrieving Contribution Image Data", self.contributedImageData)
    http.request(self.contributedImageData.url, function(response) {                                        
      let data = new Stream();                                                    

      response.on('data', function(chunk) {                                       
        data.push(chunk);                                                         
      });                                                                         

      response.on('end', function() {                                             
        try {
          console.log("Contribution.js: Successfully retrieved contribution image data");
          // write contribution image to file system 
          console.log("Contribution.js: Writing Contribution Image Data to filesystem");
          fs.writeFileSync('temp/mosaic_image/'+ self.contributed_filename +'.jpg', data.read());  
          
          //get main image stats
          console.log("Contribution.js: Resizing Contribution Image");
          gm('temp/mosaic_image/'+self.contributed_filename +'.jpg').resize(self.width,self.height).write('temp/mosaic_image/'+self.contributed_filename +'.jpg',function(){
            console.log("Contribution.js: Done resizing contribution image, stored to, ",'temp/mosaic_image/'+self.contributed_filename +'.jpg');
            self.match_avg_rgb(self.mosaic_map);
          });
          
        } catch (e) {
          self.callback(e,null);
          console.log("Contribution.js: Error while getting image stats", e);

        } 

      });                                                                         
    }).end();
  }

  match_avg_rgb(main_mosaic_map){
    let self = this;
    //loop through each value in mosaic map and pass to is a match
    console.log('Contribution.js: positioning contribution image in main mosaic map');
    
    if (self.mosaic_map.length === 0){
      self.callback("Contribution.js: mosaic map has no length");
      return;
    }

    console.log("Contribution.js: Mosaic Map", main_mosaic_map);

    let bestMatch = '' //mosaic-tile name
    let bestRGB = [];
    let bestMatchDiff = -1; //diff between rgb vals


    for (let tile in main_mosaic_map){
      //main mosaic tile's rgb
      let tileRGB = main_mosaic_map[tile][1];
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
        bestMatch = main_mosaic_map[tile][0]; //index in main mosaic map
        bestRGB = tileRGB;
      } 

      if (currentDiff < bestMatchDiff) {
        bestMatchDiff = currentDiff;
        bestMatch = main_mosaic_map[tile][0];
        bestRGB = tileRGB;
      }

    }
    console.log("Contribution.js: best rgb match: ",bestMatch,bestRGB);
    self.store_in_secondary_map(bestMatch,bestRGB,main_mosaic_map);
  }

  store_in_secondary_map(bestMatch,bestRGB,main_mosaic_map){
    //update secondary map with best match
    let self = this;
    
    console.log("Contribution.js: Retrieving Contribution (Secondary) map");
    client.get(self.main_mosaic_filename+'_contributions',function(err,data){
      if (err) {
        console.log('Contribution.js: Error while get mosaic image contributions map', err);
      } else {
        console.log("Contribution.js: Successfully retrieved Contribution Map");
        let mosaicImageMap = JSON.parse(data);
        let mosaicMapIndex = -1;

        console.log("Contribution.js: Storing Best Match in Contribution Map");
        for (let index in mosaicImageMap) {

          if (mosaicImageMap[index][0] === bestMatch && mosaicImageMap[index][1] !== self.contributed_filename) {
            mosaicMapIndex = index;
            console.log('Contribution.js: a collision exists, splicing from main mosaic map and recalculating')
            //remove the collision value from map and re-compute
            let indexToRemove = indexOfBestMatch(main_mosaic_map,bestMatch);//self.mosaic_map.indexOf(bestMatch);
            console.log('Contribution.js: Removing at index: ',indexToRemove)
            let mosaic_map = main_mosaic_map;
            if (indexToRemove > -1){
              mosaic_map = mosaic_map.splice(indexToRemove,1);
              self.match_avg_rgb(mosaic_map);
            }
            
            return;
          } 

          if (mosaicImageMap[index][0] === bestMatch && mosaicImageMap[index][1] === self.contributed_filename){
            mosaicMapIndex = index;
            console.log('Contribution.js: Value Exists Already in Contribution Map')
            return;
          }
          
        }

        if (mosaicMapIndex === -1) {
          console.log("Contribution.js: No collisions or repeats exist, adding to secondary map")
          mosaicImageMap.push([bestMatch,self.contributed_filename]);
          console.log('inserting',bestMatch,self.contributed_filename);
        } 
        
        //console.log("Contribution.js: storing contribution map in redis")
        //client.set(self.main_mosaic_filename+'_contributions',JSON.stringify(mosaicImageMap));

        let red = bestRGB[0];
        let green = bestRGB[1];
        let blue = bestRGB[2];

        self.transform_image(red,green,blue,bestMatch,mosaicImageMap);
      }
    });

  }

  transform_image(red,green,blue,bestMatch,mosaicImageMap){
    let self = this;
    console.log("Contribution.js: transofrming rgb value of contribution image ");
    try {
      im.convert(['-fill', "rgb(" + red + "," + green + "," + blue + ")", '-colorize', '80%', 'temp/mosaic_image/'+self.contributed_filename +'.jpg', 'temp/mosaic_image/'+self.contributed_filename +'.jpg'],function(err,data){
        
        if (err){console.log('Contribution.js: something went wrong in generating colored contribution',err)}
        console.log("Contribution.js: done transforming rgb value of contribution image");

        //read from file system
        console.log("Contribution.js: retrieving contribution image from filesystem");
        fs.readFile('temp/mosaic_image/'+self.contributed_filename +'.jpg',function(err,data){
          console.log("Contribution.js: Successfully retrieved contribution image from file system, sending callback");
          self.callback(null,bestMatch,data.toString('base64'),mosaicImageMap)
        });
          
      });
    } catch (e) {
      console.log("Contribution.js: Error while transforming contribution",e);
    }
  }

  
}

function naturalSorter(as, bs){
  as = as[0];
  bs = bs[0];

    if (!as || !bs) {
      return 0;
    }
    var a, b, a1, b1, i= 0, n, L,
    rx=/(\.\d+)|(\d+(\.\d+)?)|([^\d.]+)|(\.\D+)|(\.$)/g;
    if(as=== bs) return 0;
    a= as.toLowerCase().match(rx);
    b= bs.toLowerCase().match(rx);
    L= a.length;
    while(i<L){
        if(!b[i]) return 1;
        a1= a[i],
        b1= b[i++];
        if(a1!== b1){
            n= a1-b1;
            if(!isNaN(n)) return n;
            return a1>b1? 1:-1;
        }
    }
    return b[i]? -1:0;
}

function indexOfBestMatch(mosaic_map,bestMatch){
  let index = -1;

  for (let map in mosaic_map){
    if (mosaic_map[map][0] == bestMatch){
      index = map;
      break;
    }
  }

  return index;
}

module.exports = Contribution;