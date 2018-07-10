function isArray(what) {
    return Object.prototype.toString.call(what) === '[object Array]';
}

function live_stat_create_table(_props){

if(_props == undefined || _props == null){
    $('#live_stat_table').html("<h3>NO LIVE DATA AVARIABLE (43)</h3>");
    return;
}
//.table-dark
if(!isArray(_props)){
    $('#live_stat_table').html("<p>NO LIVE DATA AVARIABLE (42)</p>");
    console.log("obj is no array");
    return;
}


var tbl_string = "<table class=\"table table-dark\"><thead><tr><th scope=\"col\">PROPERTY</th><th scope=\"col\">VALUE</th><th scope=\"col\">UNIT</th></thead><tbody>";
for(var key in _props) {
    var value = _props[key];


if(value.icon == undefined || value.icon == null || value.icon == ""){
    tbl_string+="<tr><th scope=\"row\">"+value.name+"</th><td>"+value.value +"</td><td>"+value.unit+"</td></tr>";
}else{
    tbl_string+="<tr><th scope=\"row\"><img class=\"center_image\" src=\"/img/icons/psd_processed/"+value.icon+".png\" width=\"40\" height=\"0\"  alt=\""+value.nam+"\"/></th><td>"+value.value +"</td><td>"+value.unit+"</td></tr>";
}

   
    

   


}tbl_string += "</tbody></table>";


    $('#live_stat_table').html(tbl_string);
}

function live_stat_update_time(_ts){

    $('#live_stat_table_update_time').html("<p><b>" + timeConverter(_ts,"LAST UPDATE: ","") +"</b></p>");
}

function timeConverter(UNIX_timestamp, preend, postend){
    var a = new Date(UNIX_timestamp * 1000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = preend + date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec +postend;
    return time;
  }