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

            
            self.get_main_mosaic_image(function(err,data){

            });

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
    console.log("retrieiving main mosaic image")

    mosaicQuery.get(this.main_mosaic_filename , {
      success: function(mosaic) {
        console.dir("Main Mosaic Image Received: ",mosaic.get('image').name());
        
        
        //store image locally                 
        http.request(mosaic.get('image').name(), function(response) {                                        
          let data = new Stream();                                                    

          response.on('data', function(chunk) {                                       
            data.push(chunk);                                                         
          });                                                                         

          response.on('end', function() {                                             
            try {
              // read main mosaic image from file system.
              fs.writeFileSync('temp/'+ self.main_mosaic_filename +'.jpg', data.read());  
              
              mkdirp('/tmp/mosaic_image', function(err) { 
               
                  // path was created unless there was error
                  console.log('race against the clock')
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
        self.callback(error,null);
        console.log('error',error)
      }
    });
  }


  match_avg_rgb(){
    //loop through each value in mosaic map and pass to is a match
  }

  is_a_match(contributionRGB,tileRGB){

  }

  add_to_mosaic(){

  }

  update_db(){

  }
}

module.exports = Contribution;