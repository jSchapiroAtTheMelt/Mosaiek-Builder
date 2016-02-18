'use strict';
//https://github.com/lokesh/color-thief/
let Parse = require('parse/node');
let im = require('imagemagick');
let gm = require('gm');
let fs = require('fs');
let http = require('http');                                              
let  Stream = require('stream').Transform;

Parse.initialize("OEzxa2mIkW4tFTVqCG9aQK5Jbq61KMK04OFILa8s", "6UJgthU7d1tG2KTJevtp3Pn08rbAQ51IAYzT8HEi");

class Mosaic {
  constructor(input_filename,rows,columns,gen_thumbs) {
    //private vars
    this.input = {}; //main image
    this.cell = {};
    this.thumbs = [];
    this.matrix = [];
    this.output;
    this.mosaic_map = [];
    
    //public vars
    this.input_filename = input_filename;
    this.rows = rows;
    this.columns = columns;
    this.gen_thumbs = gen_thumbs;

    this.prepare();

  }

  prepare() {
    /*1) connect to Parse
      //Check cache for mosaic or get it from Parse
    */ 
      let Mosaic = Parse.Object.extend("Mosaic");
      let mosaicQuery = new Parse.Query(Mosaic);
      let self = this;
      
      mosaicQuery.get(this.input_filename , {
        success: function(mosaic) {
          console.dir(mosaic.get('image').name());
          // The object was retrieved successfully.
          //store relevant info about the mosaic in the info object
          self.input.image = mosaic.get('image').url();
          
          //store image locally                 
          http.request(self.input.image, function(response) {                                        
            let data = new Stream();                                                    

            response.on('data', function(chunk) {                                       
              data.push(chunk);                                                         
            });                                                                         

            response.on('end', function() {                                             
              fs.writeFileSync('../mosaic.jpg', data.read());  

              //get main image stats
                gm('mosaic.jpg')
                .size(function (err, size) {
                  
                  if (!err) {

                    console.log('width = ' + size.width);
                    console.log('height = ' + size.height);
                    self.input.width = size.width;
                    self.input.height = size.height;

                    //2) get what a cell width and height should be based on rows and columns
                    if (self.input.width % self.columns){
                      console.log('width not a multiple of columns')
                    }

                    if (self.input.height % self.rows){
                      console.log('height not a multiple of rows')
                    }


                    self.cell.width = self.input.width / self.columns;
                    self.cell.height = self.input.height / self.rows;
                    
                    console.log('width',self.cell.width);
                    console.log('height',self.cell.height);


                    //convert into grid - http://comments.gmane.org/gmane.comp.video.graphicsmagick.help/1207
                    im.convert(['mosaic.jpg','-crop',self.cell.width.toString()+'x'+ self.cell.height.toString(),'mosaic_tiles/mosaic.jpg'], function(err,data) {
                        if(err) { throw err; }
                        
                        self.gen_mosaic_map();
                        
                    });
                    // store in redis - key = mosaic , value = grid of images
                    console.log('done')

                  } else {

                    console.log('error finding size', err); 
                    throw err;
                  }
                });                           
            });                                                                         
          }).end();
         
        },
        error: function(object, error) {
          // The object was not retrieved successfully.
          // error is a Parse.Error with an error code and message.
          console.log('error',error)
        }
      });

    
   
    //3) genthumbs

    //4 load thumbs
    
  }

  gen_mosaic_map() {
    let mosaicTilesDir = './mosaic_tiles/';
    let self = this;

    //create array with [image-name.jpg,avgrgb value]
    fs.readdir(mosaicTilesDir,function(err,mosaicImages){

      if (err) {console.log('Error while generating mosaic map',err)}
       let counter = 0;
        for (let image in mosaicImages) {
          console.log('help')
          
          self.mosaic_map.push([mosaicImages[image],self.gen_avg_rgb(mosaicImages[image],image,mosaicImages.length,counter,function(){
            counter++;

            if (counter == mosaicImages.length-1){
              console.log(self.mosaic_map)
            }
          })]);
          
        } 
        // we need to ensure that all files have been loaded before gen avg rgb
    });

    

  }

  gen_avg_rgb (image,mapIndex,count,counter,callback){
    
    let self = this;
    
    gm('./mosaic_tiles/' + image).scale(1,1).write('mosaic_tiles/'+ image.toString() + '.txt',function(){
      fs.readFile('mosaic_tiles/'+ image.toString() + '.txt', {encoding: 'utf-8'}, function(err,data){
        if (data) {
          let tempArray = data.split(/\(([^)]+)\)/);
          let rgbString = tempArray[1].split(',');
          console.log('analyzing',rgbString)
          self.mosaic_map[mapIndex][1] = rgbString;
          
          
            callback();
          
        }
        
      });
    });
  }

  gen_initial_mosaic() {
    //for ever value in mosaic_map
    //take original image, convert it to the color of that tile and replace it
    //merge all new images in mosaic_tiles into single image and send back accross the wire
  }

  gen_thumbs() {
    /*
    1) Load thumbnails from Parse
      let images = thumbnails from Parse as JPEG's
      for (let image of images) {
        //resample image 
        imagecopyresampled($thumb, $img, 0, 0, 0, 0, $this->cell['width'], $this->cell['height'], imagesx($img), imagesy($img));
        let info = this.get_avg_color(image);
        //store avg rgb in Parse
        mysql_query('INSERT INTO thumbnails (red, green, blue, filename) VALUES ('.implode(',', $info).')', $this->db);
      }
    */
      
    
  }

  load_thumbs(){
    /*
      1) Grab all of the thumbnails from Parse
      2) push them into this.thumbs with their rgb values

    */
  }

  generate() {
    
  }

}

module.exports = Mosaic;