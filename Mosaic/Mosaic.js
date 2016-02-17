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
          console.log('data',self.input.image);
          //store image locally                 

          http.request(self.input.image, function(response) {                                        
            let data = new Stream();                                                    

            response.on('data', function(chunk) {                                       
              data.push(chunk);                                                         
            });                                                                         

            response.on('end', function() {                                             
              fs.writeFileSync('../mosaic.jpg', data.read());  
                gm('mosaic.jpg')
                .size(function (err, size) {
                  if (!err) {
                    console.log('width = ' + size.width);
                    console.log('height = ' + size.height);
                    self.input.width = size.width;
                    self.input.height = size.height;
                    
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



/*

  gm('mosaic.jpg')
            .size(function (err, size) {
              if (!err) {
                console.log('width = ' + size.width);
                self.index.width = size.width;
                console.log('height = ' + size.height);
                self.index.height = size.height;
              } else {
                console.log('error finding size', err); 
                throw err;
              }
            });
*/
   
   /*
    2) get what a cell width and height should be based on rows and columns
    if (this.input['width'] % this.columns){
      console.log('width not a multiple of columns')
    }

    if (this.input['height'] % this.rows){
      console.log('height not a multiple of rows')
    }

    this.cell['width'] = this.input['width'] / this.columns;
    this.cell['height'] = this.input['height'] / this.rows;
    
    3) genthumbs
    */
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