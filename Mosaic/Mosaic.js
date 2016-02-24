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
let remove = require('remove');
let client;

Parse.initialize("OEzxa2mIkW4tFTVqCG9aQK5Jbq61KMK04OFILa8s", "6UJgthU7d1tG2KTJevtp3Pn08rbAQ51IAYzT8HEi");

class Mosaic {


  constructor(input_filename,rows,columns,gen_thumbs,isContribution) {
    //private vars
    this.input = {}; //main image
    this.cell = {};
    this.thumbs = [];
    this.matrix = [];
    this.output;
    this.mosaic_map = [];
    this.isContribution = isContribution;
    
    //public vars
    this.input_filename = input_filename;
    this.rows = rows;
    this.columns = columns;
    this.gen_thumbs = gen_thumbs;
    this.hasMosaicMap = false;

    this.should_prepare();
  }

  should_prepare() {
    
    let self = this;

    //initialize redis
    if (process.env.REDISTOGO_URL) {
        
        let rtg   = require("url").parse(process.env.REDISTOGO_URL);
        client = require("redis").createClient(rtg.port, rtg.hostname);

        client.auth(rtg.auth.split(":")[1]);

    } else {

        client = require("redis").createClient();
        console.log('here')
    }

    self.prepare();
        
  }

  prepare() {

    //1) connect to Parse
  
      let Mosaic = Parse.Object.extend("Mosaic");
      let mosaicQuery = new Parse.Query(Mosaic);
      let self = this;

      
      console.log('Mosaic does not exist in Redis...Retrieving image from Parse');
      mosaicQuery.get(this.input_filename , {
        success: function(mosaic) {
          console.dir(mosaic.get('image').name());
          
          self.input.image = mosaic.get('image').url();
          
          //store image locally                 
          http.request(self.input.image, function(response) {                                        
            let data = new Stream();                                                    

            response.on('data', function(chunk) {                                       
              data.push(chunk);                                                         
            });                                                                         

            response.on('end', function() {                                             
              try {
                // read main mosaic image from file system.
                fs.writeFileSync('temp/'+ self.input_filename +'.jpg', data.read());  
                
                //get main image stats
                console.log('Gathering statistics about main mosaic image...');
                gm('temp/'+self.input_filename+'.jpg')
                .size(function (err, size) {
                  
                  if (!err) {

                    console.log('width = ' + size.width);
                    console.log('height = ' + size.height);
                    self.input.width = size.width;
                    self.input.height = size.height;

                    
                    if (self.input.width % self.columns){
                      console.log('width not a multiple of columns')
                    }

                    if (self.input.height % self.rows){
                      console.log('height not a multiple of rows')
                    }

                    //set the dimensions of a main mosaic cell
                    self.cell.width = self.input.width / self.columns;
                    self.cell.height = self.input.height / self.rows;
                    
                    console.log('width',self.cell.width);
                    console.log('height',self.cell.height);

                    //convert into grid - http://comments.gmane.org/gmane.comp.video.graphicsmagick.help/1207
                    im.convert(['temp/'+self.input_filename+'.jpg','-crop',self.cell.width.toString()+'x'+ self.cell.height.toString(),'temp/mosaic_tiles/mosaic.jpg'], function(err,data) {
                        if(err) { throw err; }
                        self.gen_mosaic_map();
                          
                    });
                    
                    // store in redis - key = mosaic , value = grid of images
                    console.log('done')

                  } else {

                    console.log('Error finding size of mosaic and converting into tiles: ', err); 
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

    let mosaicTilesDir = 'temp/mosaic_tiles/';
    let self = this;
    let loopcount = 0;
    //batch convert everything in mosaic tiles to rgb
    
    try {
      //read all tiles in ./mosaic_tiles to mosaicImages variable
      fs.readdir(mosaicTilesDir,function(err,mosaicImages){
        
        let count = 0;
        if (err) {console.log('Error while reading mosaic tiles from  temp/mosaic_tiles',err)}

        //get average rgb value of each mosaic tile and store in mosaic_map
        //https://github.com/aheckmann/gm/issues/42
        let counter = 0;
        let i = 0;
        let chunkSize = 50; // 100 was too many. Choked every time at 80 or 81.
        (function loop(i){
          
          self.gen_avg_rgb(mosaicImages[i],i,mosaicImages.length,counter,function(rgbString,index,image){
            
             self.mosaic_map.push([image,rgbString])
             counter++;
             if (counter == mosaicImages.length-1){
                
                console.log('done finding average rgb value for each mosaict tile')
                client.set(self.input_filename,JSON.stringify(self.mosaic_map)); // Store Mosaic Map in Redis
                client.set(self.input_filename+'_dimens',JSON.stringify([self.cell.width,self.cell.height]));
                client.set(self.input_filename + '_width_height',JSON.stringify([self.input.width,self.input.height]));
                
                //remove all files in /mosaic_tiles

                remove('temp/mosaic_tiles/',function(){ //removes entire directory
                  console.log('clearing out temp directory')
                  fs.mkdirSync('temp/mosaic_tiles'); //replaces it but empty
                })
                
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
            console.log('tempArray',rgbString)
            callback(rgbString,mapIndex,image);
            
          }
          
        });
      });
    } catch(e) {
      console.log('Error while generating avg rgb', e);
    }
  }

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
    
  }

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
    
  }

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