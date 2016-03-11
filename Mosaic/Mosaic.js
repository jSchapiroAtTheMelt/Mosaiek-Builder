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
let client;

Parse.initialize("OEzxa2mIkW4tFTVqCG9aQK5Jbq61KMK04OFILa8s", "6UJgthU7d1tG2KTJevtp3Pn08rbAQ51IAYzT8HEi");

//initialize redis
console.log("Mosaic.js: Initializing Redis")
if (process.env.REDISTOGO_URL) {
    
    let rtg   = require("url").parse(process.env.REDISTOGO_URL);
    client = require("redis").createClient(rtg.port, rtg.hostname);

    client.auth(rtg.auth.split(":")[1]);

} else {

    client = require("redis").createClient();
    
}

class Mosaic {

  constructor(input_filename,rows,columns,gen_thumbs,callback) {
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
    this.hasMosaicMap = false;
    this.callback = callback;
   
    this.should_prepare();
  }

  should_prepare() {
    
    let self = this;

    self.prepare();
        
  }

  prepare() {

    // connect to Parse
  
      let Mosaic = Parse.Object.extend("Mosaic");
      let mosaicQuery = new Parse.Query(Mosaic);
      let self = this;

      // retrieve main mosaic object from parse
      console.log('Mosaic.js: Retrieving main mosaic object from Parse');
      mosaicQuery.get(this.input_filename , {
        success: function(mosaic) {
          console.log('Mosaic.js: Successfully retrieved mosaic object from parse')
          console.dir(mosaic.get('image').name());
          
          self.input.image = mosaic.get('image').url();
          
          //retrieve image data by using mosaic object image url
          console.log('Mosaic.js: Retrieving main mosaic image from mosaic object image url')                
          http.request(self.input.image, function(response) {                                        
            let data = new Stream();                                                    

            response.on('data', function(chunk) {                                       
              data.push(chunk);                                                         
            });                                                                         

            response.on('end', function() {                                             
              try {
                console.log('Mosaic.js: Successfully received main mosaic image data')
                // write main mosaic image to filesystem
                fs.writeFileSync('temp/'+ self.input_filename +'.jpg', data.read());  
                console.log('Mosaic.js: writing main mosaic image to file system at: ', 'temp/'+ self.input_filename +'.jpg')

                //create directory for the main mosaic image tiles
                console.log("Mosaic.js: Creating temp directory for main mosaic image tiles")
                mkdirp('/tmp/mosaic_tiles', function(err) { 

                  console.log("Mosaic.js: Successfully created temp directory for main mosaic image tiles")
                  
                  //analyze size of main mosaic image
                  console.log("Mosaic.js: Gather size stats about main mosaic image")
                  gm('temp/'+self.input_filename+'.jpg')
                  .size(function (err, size) {
                     console.log("Mosaic.js: Successfully gathered main mosaic image size stats")
                    if (!err) {

                      console.log('Mosaic.js: Main Mosaic Width = ' + size.width);
                      console.log('Mosaic.js: Main Mosaic Height = ' + size.height);
                      self.input.width = size.width;
                      self.input.height = size.height;

                      //set the dimensions of a main mosaic cell
                      self.cell.width = self.input.width / self.columns;
                      self.cell.height = self.input.height / self.rows;
                      
                      console.log('Mosaic.js: Main Mosaic Cell Width',self.cell.width);
                      console.log('Mosaic.js: Main Mosaic Cell Height',self.cell.height);

                      //convert into grid based on main mosaic cell width - http://comments.gmane.org/gmane.comp.video.graphicsmagick.help/1207
                      console.log("Mosaic.js: Converting main mosaic image into equal sized cells")
                      im.convert(['temp/'+self.input_filename+'.jpg','-crop',self.cell.width.toString()+'x'+ self.cell.height.toString(),'temp/mosaic_tiles/mosaic.jpg'], function(err,data) {
                          if(err) { throw err; }
                          console.log("Mosaic.js: Successfully created cells from main mosaic image")
                          self.gen_mosaic_map();
                            
                      });
                      
                      // store in redis - key = mosaic , value = grid of images
                      console.log('done')

                    } else {
                      self.callback(err,null);
                      console.log('Error finding size of mosaic and converting into tiles: ', err); 
                      throw err;
                    }
                  });
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

  gen_mosaic_map() {

    let mosaicTilesDir = 'temp/mosaic_tiles/';
    let self = this;
    let loopcount = 0;
    //batch convert everything in mosaic tiles to rgb
    
    try {
      //read all tiles in ./mosaic_tiles to mosaicImages variable
      console.log("Mosaic.js: Reading all tiles from ",mosaicTilesDir);
      fs.readdir(mosaicTilesDir,function(err,mosaicImages){
        console.log("Mosaic.js: Successfully read all tiles from", mosaicTilesDir);
        let count = 0;
        if (err) {
          self.callback(err,null);
          console.log('Mosaic.js: Error while reading mosaic tiles from  temp/mosaic_tiles',err)
        }

        //get average rgb value of each mosaic tile and store in mosaic_map
        //https://github.com/aheckmann/gm/issues/42
        let counter = 0;
        let i = 0;
        let chunkSize = 50; 
        console.log("Mosaic.js: Gathering average rgb value for each main mosaic tile");
        
        (function loop(i){
          
          self.gen_avg_rgb(mosaicImages[i],i,mosaicImages.length,counter,function(rgbString,index,image){
            
             self.mosaic_map.push([image,rgbString])
             counter++;
             if (counter == mosaicImages.length-1){
                console.log("Mosaic.js: Successfully found rgb value for each mosaic tile");
                
                //trim the fat - excess tiles that are not the dimensions of the main mosaic cell
                if (self.mosaic_map.length > self.rows * self.columns) self.mosaic_map = self.mosaic_map.slice(0, self.rows * self.columns);

                //clear existing ref - only useful when testing on the same mosaic
                client.del(self.input_filename);
                client.del(self.input_filename+'_contributions');
                client.del(self.input_filename+'_dimens');
                client.del(self.input_filename + '_width_height');

                console.log("Mosaic.js: Storing main mosaic map in Redis");
                
                client.set(self.input_filename,JSON.stringify(self.mosaic_map)); // Store Mosaic Map in Redis
                client.set(self.input_filename+'_contributions',JSON.stringify([]));//mosaic images
                client.set(self.input_filename+'_dimens',JSON.stringify([self.cell.width,self.cell.height]));
                client.set(self.input_filename + '_width_height',JSON.stringify([self.input.width,self.input.height]));
                
                //remove all files in /mosaic_tiles
                console.log("Mosaic.js: Removing the contents of temp/mosaic_tiles")
                remove('temp/mosaic_tiles/',function(){ //removes entire directory
                  console.log("Mosaic.js: Successfully removed the contents of temp/mosaic_tiles");
                  fs.mkdirSync('temp/mosaic_tiles'); //replaces it but empty
                })

                self.callback(null,self.mosaic_map)

                //self.gen_initial_mosaic(); saving this for a rainy day
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
      gm('temp/mosaic_tiles/' + image).options({imageMagick:true}).scale(1,1).write('temp/mosaic_tiles/'+ image.toString() + '.txt',function(){
        fs.readFile('temp/mosaic_tiles/'+ image.toString() + '.txt', {encoding: 'utf-8'}, function(err,data){
          if (data) {
            let tempArray = data.split(/\(([^)]+)\)/);
            let rgbString = tempArray[3].split(',');
            callback(rgbString,mapIndex,image);
            
          }
          
        });
      });
    } catch(e) {
      console.log('Error while generating avg rgb', e);
    }
  }

  /*
  gen_initial_mosaic() {
    console.log('genearting intial mosaic....')
    let self = this;
    try {

      //get a sample sized cell to convert to the corect rgb value
      gm('temp/'+self.input_filename+'.jpg').resize(this.cell.width,this.cell.height).write('temp/'+self.input_filename+'.jpg',function(){
        //for each image in the mosaic map
        let count = 0;

        let i = 0;
        let chunkSize = 50; // 100 was too many. Choked every time at 80 or 81.
        (function loop(i){

          let mosaic = self.mosaic_map[i][0];
          let mosaicRGB = self.mosaic_map[i][1];
          let red = mosaicRGB[0];
          let green = mosaicRGB[1];
          let blue = mosaicRGB[2];
          console.log('rgb', red,green,blue );

          try {
          
            im.convert(['-fill', "rgb(" + red + "," + green + "," + blue + ")", '-colorize', '80%', 'mosaic_tile.jpg', 'mosaic_tiles_converted/'+mosaic.toString()],function(err,data){
              
              if (err){console.log('something went wrong in generating colored tiles')}
  
                count ++;
                
                if (count == self.mosaic_map.length-1) {
                  console.log('Done generating colored tiles');
                  self.merge_colored_tiles();
                }
                
            });

          } catch (e) {
            console.log('Error while changing color of mosaic tile', e);
          }
          
          i++;
          if(i == self.mosaic_map.length) return; // we're done.
          if(i%chunkSize == 0){
            setTimeout(function(){ loop(i); }, 50);
          } else {
            loop(i);
          }
        })(0);

      });
    } catch (e) {
      console.log("Error while resizing main mosaic image",e);
    }
    
  } */

/*
  merge_colored_tiles() {
    
    let self = this;
    
    console.log('Merging colored tiles into final mosaic')
    
    //generate single string of mosaic_tile filenames
    let compoundTileString = self.mosaic_map.reduce(function(previousValue, currentValue, currentIndex, array){
      return previousValue + currentValue[0] + ' ';
    });
    
    //remove the .DS_Store value
    let cleanCompoundTileString = compoundTileString.slice(10).toString();
    //convert into array
    let mosaicTilesArray = cleanCompoundTileString.split(' ');
    //structure with correct file path
    mosaicTilesArray = mosaicTilesArray.map(function(value){
      return 'mosaic_tiles_converted/' + value;
    });


    //order the value of arrays mosaic_tiles_converted/filename-0 to mosaic_tiles_converted/filename-n
    mosaicTilesArray.sort(naturalSorter);
    mosaicTilesArray[mosaicTilesArray.length - 1] = '-tile';
    mosaicTilesArray.push(self.rows.toString() + 'x' + self.columns.toString());
    mosaicTilesArray.push('-geometry');
    mosaicTilesArray.push('+0+0');
    mosaicTilesArray.push('finalMosaic.jpg');

    
    //merge the contents of mosaic_tiles_converted into single image
    sm.montage(mosaicTilesArray, function(err, stdout){
      if (err) console.log(err);
      console.log('Finished merging images to form finalMosaic');
      //send image to parse
      //send across the wire to iOs
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