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
    this.total_cells = 40*40;
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
            
            if (dimens[0] == null || dimens[1] == null){
              self.callback("Contribution.js: Could not retrieve main mosaic dimensions",null);
            } else {
              
              self.width = dimens[0] * 10;
              self.height = dimens[1] * 10;

              self.get_main_mosaic_image();
            }
           

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
            //self.match_avg_rgb(self.mosaic_map);
            self.contribute_to_mosaic();
          });
          
        } catch (e) {
          self.callback(e,null);
          console.log("Contribution.js: Error while getting image stats", e);

        } 

      });                                                                         
    }).end();
  }


  contribute_to_mosaic(){
    let self = this;
     client.get(self.main_mosaic_filename+'_contributions',function(err,data){
        if (err){console.log('Contribution.js: Error while retrieving secondary map',err)}
        else{
          let secondary_map = JSON.parse(data);
          //if first contribution
          //mosaic image rgb
          let imageRGB = self.rgb;
          let imageRed = self.rgb[0];
          let imageGreen = self.rgb[1];
          let imageBlue = self.rgb[2];

          let contributionsToMake = [];

            if (secondary_map.length === 0){
              //for every value in the main mosaic map

              for (let tile in self.mosaic_map){
                //main mosaic tile's rgb
                let tileRGB = self.mosaic_map[tile][1];
                let tileRed = parseInt(tileRGB[0]);
                let tileGreen = parseInt(tileRGB[1]);
                let tileBlue = parseInt(tileRGB[2]);

                //RGB Diffs
                let redDiff = Math.abs(tileRed - imageRed);
                let greenDiff = Math.abs(tileGreen - imageGreen);
                let blueDiff = Math.abs(tileBlue - imageBlue); 
                
                //console.log("Comparing :",imageRGB + 'and ' + tileRGB)
                let currentDiff = redDiff + greenDiff + blueDiff;
                //add entry to secondary map with main mosaic tiles name | m tile rgb | contr image name | contr rgb diff
                secondary_map.push([self.mosaic_map[tile][0],self.mosaic_map[tile][1],self.contributed_filename,currentDiff])
                
                
              }
              self.download_each_contribution(secondary_map,contributionsToMake);

            } else {
              
              //for every value in secondary map

              for (let tile in secondary_map){

                let tileRGB = secondary_map[tile][1];
              
                let tileRed = parseInt(tileRGB[0]);
                let tileGreen = parseInt(tileRGB[1]);
                let tileBlue = parseInt(tileRGB[2]);

                //RGB Diffs
                let redDiff = Math.abs(tileRed - imageRed);
                let greenDiff = Math.abs(tileGreen - imageGreen);
                let blueDiff = Math.abs(tileBlue - imageBlue); 
                
                let currentDiff = redDiff + greenDiff + blueDiff;
                
                if (currentDiff <= secondary_map[tile][3]){
                  secondary_map[tile][2] = self.contributed_filename;
                  secondary_map[tile][3] = currentDiff;
                  contributionsToMake.push(secondary_map[tile]);
                 
                }
                
              }

              self.download_each_contribution(secondary_map,contributionsToMake);

            }

        }

     });
  }


  download_each_contribution(secondary_map,contributionsToMake){

    let MosaicImage = Parse.Object.extend("MosaicImage");
    let mosaicImageQuery = new Parse.Query(MosaicImage);
    let self = this;
    let mosaicImageCount = 0; 
    let contributionsToRetrieve = [];
    let retrievedMosaicImageNames = [];

    //get the id of each unique contribution to download
    for (let mosaicImage in secondary_map){ 
      let mosaicImageName = secondary_map[mosaicImage][2]
      if (mosaicImageName !== undefined){
        if (contributionsToRetrieve.indexOf(mosaicImageName) === -1){
          contributionsToRetrieve.push(mosaicImageName);
        }
      }
    }

    for (let mosaicImageName of contributionsToRetrieve){
      
      console.log("Contribution.js: Retrieving Contribution Mosaic Object", mosaicImageName)
        mosaicImageQuery.get(mosaicImageName , {
          success: function(mosaicImage) {
            console.log("Contribution.js: Contribution Mosaic Object Received: ", mosaicImage);
            
            //get image data for main mosaic object
            console.log("Contribution.js: Retrieving  Mosaic Image",mosaicImageName)                
            http.request(mosaicImage.get('image').url(), function(response) {                                        
              let data = new Stream();                                                    

              response.on('data', function(chunk) {                                       
                data.push(chunk);                                                         
              });                                                                         

              response.on('end', function() {                                             
                try {
                  // read main mosaic image from file system.
                   console.log("Contribution.js: Successfully retrieved Contribution Mosaic Object");
                  fs.writeFileSync('temp/contribution_images/'+ mosaicImageName +'.jpg', data.read()); 
                  mosaicImageCount ++
                  if (mosaicImageCount === contributionsToRetrieve.length) {
                    console.log("Contribution.js: Successfully retrieved all contribution images")
                    self.resize_contribution_images(secondary_map)
                  }
                  
                } catch (e) {
                  self.callback(e,null);
                  console.log("Error while getting mosaic contribution image ", e);

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

  resize_contribution_images(secondary_map){

    let self = this;

    fs.readdir('temp/contribution_images/', function(err, contributions) {
      if (err){console.log('Contribution.js: error while retrieving contents of temp/contribution_images/')}
      else {

        let i = 0;
        let chunkSize = 50; 
        //console.log("Contribution.js: Transforming 40x40 mosaic for the first time", secondary_map);
        (function loop(i){
          
          gm('temp/contribution_images/'+contributions[i]).resize(self.width,self.height).write('temp/contribution_images/'+contributions[i],function(){
            console.log("Contribution.js: Done resizing contribution image, stored to, ",'temp/contribution_images/'+contributions[i]);
            //self.match_avg_rgb(self.mosaic_map);
            console.log("Contribution.js: ", contributions.length,i)
            i++;
            if(i == contributions.length){
              console.log("Contribution.js: Done Transforming Size  for Each Contribution Tile ", self.width, self.height)
              self.populate_contribution_image_tiles(secondary_map)

            } else {
              if(i%chunkSize == 0){
                setTimeout(function(){ loop(i); }, 50);
              } else {
                loop(i);
              }

            }// we're done.
            

          });

          
          

        })(0);
      }
  });
    
}

populate_contribution_image_tiles(secondary_map){
  //go through secondary map and populate contribution_images directory with corresponding image and coorect rgb value
  let i = 0;
  let chunkSize = 50; 
  let self = this;
  
  (function loop(i){
    let mainMosaicImageName = secondary_map[i][0];
    let newRGBValue = secondary_map[i][1];
    let contributionImageName = secondary_map[i][2];

    let red = newRGBValue[0];
    let green = newRGBValue[1];
    let blue = newRGBValue[2];

    
    //console.log("Contribution.js: transofrming rgb value of contribution image ");
    try {
      im.convert(['-fill', "rgb(" + red + "," + green + "," + blue + ")", '-colorize', '80%', 'temp/contribution_images/'+ contributionImageName +'.jpg', 'temp/contribution_image_tiles/'+mainMosaicImageName],function(err,data){
        
        if (err){console.log('Contribution.js: something went wrong in generating colored contribution',err)}
        else {

          i++;
          if(i == secondary_map.length){
            console.log("Contribution.js: Done Transforming RGB  for Each Contribution Tile ")
            self.merge_contribution_images(secondary_map)

          } else {
            if(i%chunkSize == 0){
              setTimeout(function(){ loop(i); }, 50);
            } else {
              loop(i);
            }

          }// we're done.


        }
      });
    } catch (e) {
      console.log("Contribution.js: Error while transforming contribution",e);
    }

  })(0);
}
    
  
  transform_image(red,green,blue,bestMatch,mosaicImageMap,complete,index){
    let self = this;
    //console.log("Contribution.js: transofrming rgb value of contribution image ");
    try {
      im.convert(['-fill', "rgb(" + red + "," + green + "," + blue + ")", '-colorize', '80%', 'temp/mosaic_image/'+self.contributed_filename +'.jpg', 'temp/contribution_images/'+self.contributed_filename + '_' + index + '.jpg'],function(err,data){
        
        if (err){console.log('Contribution.js: something went wrong in generating colored contribution',err)}

      });
    } catch (e) {
      console.log("Contribution.js: Error while transforming contribution",e);
    }
  }

  merge_contribution_images(secondary_map){

    let self = this;

    fs.readdir('temp/contribution_image_tiles/', function(err, contributions) {
      if (err){console.log('Contribution.js: error while retrieving contents of temp/contribution_images/')}
      else {
        //console.log('Contribution.js: Merging colored tiles into final mosaic', contributions)
        
        //generate single string of mosaic_tile filenames
        contributions = contributions.sort(cmpStringsWithNumbers);
        console.log('Contributions',contributions)

        let compoundTileString = contributions.reduce(function(previousValue, currentValue, currentIndex, array){
          return previousValue + currentValue + ' ';
        });
        
        //remove the .DS_Store value
        let cleanCompoundTileString = compoundTileString;
        //convert into array
        let mosaicTilesArray = cleanCompoundTileString.split(' ');
        //structure with correct file path
        mosaicTilesArray = mosaicTilesArray.map(function(value){
          return 'temp/contribution_image_tiles/' + value;
        });


        //order the value of arrays mosaic_tiles_converted/filename-0 to mosaic_tiles_converted/filename-n
        mosaicTilesArray.sort(naturalSorter);
        mosaicTilesArray[mosaicTilesArray.length - 1] = '-tile';
        mosaicTilesArray.push('40' + 'x' + '40');
        mosaicTilesArray.push('-geometry');
        mosaicTilesArray.push('+0+0');
        mosaicTilesArray.push('temp/final_mosaic/finalMosaic.jpg');
            
        
        //merge the contents of mosaic_tiles_converted into single image
        sm.montage(mosaicTilesArray, function(err, stdout){
          if (err) console.log(err);
          console.log('Contribution.js: Finished merging images to form finalMosaic');

          fs.readFile('temp/final_mosaic/finalMosaic.jpg',function(err,data){
            
            if (data){
              self.callback(err,null,data.toString('base64'),secondary_map,true);
            } else {
              self.callback(err,null)
            }
            

            remove('temp/final_mosaic/',function(){
              try {
                
                  fs.mkdirSync('temp/final_mosaic/'); //replaces it but empty 
                
                
              } catch (e) {
                console.log("Contribution.js: Error while recreating temp/finalMosaic//",e)
              }
            
            });

            remove('temp/contribution_image_tiles/',function(){ //removes entire directory
              console.log("Contribution.js: Successfully removed the contents of temp/contribution_image_tiles/");
              try {
                
                  fs.mkdirSync('temp/contribution_image_tiles/'); //replaces it but empty 
                
                
              } catch (e) {
                console.log("Contribution.js: Error while recreating temp/contribution_image_tiles/",e)
              }
            })

          });
          //send image to parse
          //send across the wire to iOs
        });
   
      }

    });
    
  }

}

function cmpStringsWithNumbers (a, b) {
  var reParts = /\d+|\D+/g;
  
   // Regular expression to test if the string has a digit.
   var reDigit = /\d/;
    // Get rid of casing issues.
    a = a.toUpperCase();
    b = b.toUpperCase();
 
    // Separates the strings into substrings that have only digits and those
    // that have no digits.
    var aParts = a.match(reParts);
    var bParts = b.match(reParts);
 
    // Used to determine if aPart and bPart are digits.
    var isDigitPart;
 
    // If `a` and `b` are strings with substring parts that match...
    if(aParts && bParts &&
        (isDigitPart = reDigit.test(aParts[0])) == reDigit.test(bParts[0])) {
      // Loop through each substring part to compare the overall strings.
      var len = Math.min(aParts.length, bParts.length);
      for(var i = 0; i < len; i++) {
        var aPart = aParts[i];
        var bPart = bParts[i];
 
        // If comparing digits, convert them to numbers (assuming base 10).
        if(isDigitPart) {
          aPart = parseInt(aPart, 10);
          bPart = parseInt(bPart, 10);
        }
 
        // If the substrings aren't equal, return either -1 or 1.
        if(aPart != bPart) {
          return aPart < bPart ? -1 : 1;
        }
 
        // Toggle the value of isDigitPart since the parts will alternate.
        isDigitPart = !isDigitPart;
      }
    }
 
    // Use normal comparison.
    return (a >= b) - (a <= b);
  };

function naturalSorter(as, bs){
 
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