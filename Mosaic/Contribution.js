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
    this.callback = callback;

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
  
  }

  get_main_mosaic_image(cb){
    let Mosaic = Parse.Object.extend("Mosaic");
    let mosaicQuery = new Parse.Query(Mosaic);
    let self = this;
    console.log("retrieiving contribution image",self.main_mosaic_filename)

    mosaicQuery.get(self.main_mosaic_filename , {
      success: function(mosaic) {
        console.log("Contribution Mosaic Image Received: ", mosaic);
        
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
    console.log("Retrieving image from", self.contributedImageData)
    http.request(self.contributedImageData.url, function(response) {                                        
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
          self.callback(e,null);
          console.log("Error while getting image stats", e);

        } 

      });                                                                         
    }).end();
  }

  match_avg_rgb(){
    let self = this;
    //loop through each value in mosaic map and pass to is a match
    console.log('comparing mosaic image to mosaic map, count:',self.mosaic_map.length);
    let bestMatch = '' //mosaic-tile name
    let bestRGB = [];
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
        bestMatch = tile;
        bestRGB = tileRGB;
      } 

      if (currentDiff < bestMatchDiff) {
        bestMatchDiff = currentDiff;
        bestMatch = tile;
        bestRGB = tileRGB;
      }

    }
    console.log('current images rgb',self.rgb)
    console.log('Best Match Diff', bestMatch)
    self.store_in_secondary_map(bestMatch,bestRGB);
  }

  store_in_secondary_map(bestMatch,bestRGB){
    //update secondary map with m
    let self = this;
    
    client.get(self.main_mosaic_filename+'_contributions',function(err,data){
      if (err) {
        console.log('Error while get mosaic image contributions map', err);
      } else {
        let mosaicImageMap = JSON.parse(data);
        let mosaicMapIndex = -1;

        console.log('looping through secondary map',data)
        for (let index in mosaicImageMap) {
          
          console.log('comparing',mosaicImageMap[index][0],bestMatch)
          if (mosaicImageMap[index][0] === bestMatch && mosaicImageMap[index][1] !== self.contributed_filename) {
            mosaicMapIndex = index;
            console.log('collision!')
            //remove the collision value from map and re-compute
            self.mosaic_map.splice(bestMatch,1);
            self.match_avg_rgb();
            return;
          } 

          if (mosaicImageMap[index][0] === bestMatch && mosaicImageMap[index][1] === self.contributed_filename){
            mosaicMapIndex = index;
            console.log('value exists')
            return;
          }
          
        }

        if (mosaicMapIndex === -1) {
          
          mosaicImageMap.push([bestMatch,self.contributed_filename]);
          console.log('inserting',bestMatch,self.contributed_filename);
        } else {
          mosaicImageMap.push([bestMatch,self.contributed_filename]);
        }
        
        console.log('best match',bestMatch)
        console.log('best RGB',bestRGB)
        console.log('sorted data',mosaicImageMap.sort(naturalSorter))
        console.log('count',self.mosaic_map.length)

        
        client.set(self.main_mosaic_filename+'_contributions',JSON.stringify(mosaicImageMap));

        let red = bestRGB[0];
        let green = bestRGB[1];
        let blue = bestRGB[2];

        self.transform_image(red,green,blue,bestMatch);
      }
    });

  }

  transform_image(red,green,blue,bestMatch){
    let self = this;
    try {
      im.convert(['-fill', "rgb(" + red + "," + green + "," + blue + ")", '-colorize', '80%', 'temp/mosaic_image/'+self.contributed_filename +'.jpg', 'temp/mosaic_image/'+self.contributed_filename +'.jpg'],function(err,data){
        
        if (err){console.log('something went wrong in generating colored contribution',err)}
        console.log('done transforming contribution to rgb value')

        //read from file system
        fs.readFile('temp/mosaic_image/'+self.contributed_filename +'.jpg',function(err,data){
          self.callback(null,bestMatch,data.toString('base64'))
        });
          
      });
    } catch (e) {
      console.log("Error while transforming contribution",e);
    }
  }

  add_to_mosaic(){
    //socket io interaction
  }

  update_db(){

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

module.exports = Contribution;