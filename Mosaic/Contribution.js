
class Contribution() {
  //get mosaic_map for contribution's mosaic
  //compare avg rgb of contribution to each tile in mosaic_map
  //determine best fit
  //layer on top of mosaic
  //update db

  get_mosaic_map(){
    //read map from redis -> json parse -> store as instance property
    //make http request to get image data
    //resize image to mosaic maps cell size
    //write to file system
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