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
              try {
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
                        console.log('generating mosaic',data)
                        
                          
                        self.gen_mosaic_map();
                          
                        
                    });
                    // store in redis - key = mosaic , value = grid of images
                    console.log('done')

                  } else {

                    console.log('error finding size', err); 
                    throw err;
                  }
                });
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

  gen_mosaic_map() {
    let mosaicTilesDir = './mosaic_tiles/';
    let self = this;
    let loopcount = 0;
    //batch convert everything in mosaic tiles to rgb
    
    try {
      fs.readdir(mosaicTilesDir,function(err,mosaicImages){
        
        let count = 0;
        if (err) {console.log('Error while generating mosaic map',err)}

        //call gen_avg_rb recursively to simulate synchronosity
        //https://github.com/aheckmann/gm/issues/42
        let counter = 0;
        let i = 0;
        let chunkSize = 50; // 100 was too many. Choked every time at 80 or 81.
        (function loop(i){

          var filename = mosaicImages[i];
          
          self.mosaic_map.push(mosaicImages[i],[]);
          self.gen_avg_rgb(mosaicImages[i],i,mosaicImages.length,counter,function(){
             //console.log('i',i);
             counter++;
             if (counter == mosaicImages.length-1){
                //console.log('free',self.mosaic_map);
                console.log('done')
                //console.log('mosaic',self.mosaic_map);
                //self.gen_initial_mosaic();
             }
           })
          
          i++;
          if(i == mosaicImages.length) return; // we're done.
          if(i%chunkSize == 0){
            setTimeout(function(){ loop(i); }, 50);
          } else {
            loop(i);
          }
        })(0);

      });

    } catch (e) {
      console.log('Error while generating mosaic_map', e);
    }  

  }

  gen_avg_rgb (image,mapIndex,count,counter,callback){
    
    let self = this;
    try {
      
      gm('./mosaic_tiles/' + image).options({imageMagick:true}).scale(1,1).write('mosaic_tiles/'+ image.toString() + '.txt',function(){
        fs.readFile('mosaic_tiles/'+ image.toString() + '.txt', {encoding: 'utf-8'}, function(err,data){
          if (data) {
            let tempArray = data.split(/\(([^)]+)\)/);
            let rgbString = tempArray[1].split(',');
            self.mosaic_map[mapIndex][1] = rgbString;
            console.log('rgb String',mapIndex, rgbString)
            callback();
            
          }
          
        });
      });
    } catch(e) {
      console.log('Error while generating avg rgb', e);
    }
  }

  /*gen_initial_mosaic() {
    console.log('genearting intial mosaic....')
    let self = this;
    try {
      gm('mosaic.jpg').resize(this.cell.width,this.cell.height).write('mosaic_tile.jpg',function(){
        //for each image in the mosaic map
        let count = 0;
        for (let mosaic of self.mosaic_map){
          let rgbVal = mosaic[1];
          console.log('RGB', mosaic);
          if (rgbVal) {
            if (rgbVal.length >=3){
              let red = rgbVal[0].toString();
              let green = rgbVal[1].toString();
              let blue = rgbVal[2].toString();
              
              // convert -fill blue -colorize 50% mosaic_tile.jpg mosaic_tile_colored.jpg
              try {
                im.convert(['-fill', "rgb(" + red + "," + green + "," + blue + ")", '-colorize', '80%', 'mosaic_tile.jpg', 'mosaic_tiles_converted/'+mosaic[0].toString()],function(err,data){
                  if (err){console.log('something went wrong in generating colored tiles')}
                    //console.log('finished generating colored tiles')
                    count ++;
                    console.log('count',count);
                    if (count == self.mosaic_map.length-1) {
                      self.merge_colored_tiles();
                    }
                    
                });
              } catch (e) {
                console.log('Error while changing color of tile', e);
              }
            }
          }
        }
          //take mosaic_tile and convert it to the avg rgb of that image
          //return new map
      });
    } catch (e) {
      console.log("Error while resizing main mosaic image",e);
    }
    //for ever value in mosaic_map
    //take original image, convert it to the color of that tile and replace it
    //merge all new images in mosaic_tiles into single image and send back accross the wire
  }*/

  /*merge_colored_tiles() {
    let self = this;
    
    console.log('merging colored tiles')
    let compoundTileString = self.mosaic_map.reduce(function(previousValue, currentValue, currentIndex, array){
      return previousValue + currentValue[0] + ' ';
    });
    
    let cleanCompoundTileString = compoundTileString.slice(10).toString();
    let mosaicTilesArray = cleanCompoundTileString.split(' ');
    mosaicTilesArray = mosaicTilesArray.map(function(value){
      return 'mosaic_tiles_converted/' + value;
    });
    mosaicTilesArray.sort(naturalSorter);
    mosaicTilesArray[mosaicTilesArray.length - 1] = '-tile';
    mosaicTilesArray.push(self.rows.toString() + 'x' + self.columns.toString());
    mosaicTilesArray.push('-geometry');
    mosaicTilesArray.push('+0+0');
    mosaicTilesArray.push('finalMosaic.jpg');
    console.log(mosaicTilesArray);
    
    sm.montage(mosaicTilesArray, function(err, stdout){
      if (err) console.log(err);
      console.log('hey there');
    });
    
  }*/


}




function naturalSorter(as, bs){
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

module.exports = Mosaic;