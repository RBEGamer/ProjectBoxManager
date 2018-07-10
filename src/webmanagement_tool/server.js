var express = require('express');
var app = express();
var path = require('path');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var sessionstore = require('sessionstore');
var os = require("os");
var chalk = require('chalk');
var mqtt = require('mqtt');
var config = require('./config.json');
var uuidv1 = require('uuid/v1');
var got = require('got');
var randomstring = require("randomstring");
var nano = require('nano')(config.couchdb_url);
var fs = require('fs');

var port = process.env.PORT || config.webserver_default_port || 3000;

//----------------------------- EXPRESS APP SETUP ------------------------------------------//
app.set('trust proxy', 1);
app.use(function (req, res, next) {
    if (!req.session) {
        return next(); //handle error
    }
    next(); //otherwise continue
});
app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile);
// Routing
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'ssshhfddghjhgewretjrdhfsgdfadvsgvshthhh',
    store: sessionstore.createSessionStore(),
    resave: true,
    saveUninitialized: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

server.listen(port, function () {
    console.log('Server listening at port %d', port);
});






//**----------- DB INIT--------------- */
var pbm_db_projects = null;
nano.db.create(config.couchdb_db_name_projects, function () {
    pbm_db_projects = nano.use(config.couchdb_db_name_projects);
});

var pbm_db_parts = null;
nano.db.create(config.couchdb_db_name_parts, function () {
    pbm_db_parts = nano.use(config.couchdb_db_name_parts);
});





// CREATE PART ICON LIST




function readFiles(dirname, dirname_webserver, onFileContent, onError) {
    fs.readdir(dirname, function (err, filenames) {
        if (err) {
            onError(err);
            return;
        }
        var file_array = [];

        for (let index = 0; index < filenames.length; index++) {
            const element = filenames[index];
            file_array.push({
                type: "icon",
                abs_path: dirname_webserver + "/" + element,
                filename: element
            });
        }
        var json_content = {
            part_icons: file_array
        };
        fs.writeFileSync(dirname + "/part_icons_list.json", JSON.stringify(json_content), {
            encoding: 'utf8',
            flag: 'w'
        })
        console.log("###  create part file list");
    });
}
var data = {};
readFiles('./public/img/part_icons', '/img/part_icons', function (filename, content) {}, function (err) {
    console.log("[ERR] : cant create part_icons_list.json");
});




app.get('/', function (req, res) {
    sess = req.session;


    var q = {
        "selector": {
            "_id": {
                "$gt": null
            },
        }
    };
    pbm_db_projects.find(q, (err, body, header) => {
        if (err) {
            console.log('Error thrown: ', err.message);
            res.redirect("/error?r=db_query_error_project_find");
            return;
        }
        if(body.docs.length <= 0){
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_project");
        }
        var project_doc = body.docs[0];
        var pro = [];

        for (let index = 0; index < body.docs.length; index++) {
            const element = body.docs[index];
            pro.push(element);
        }

        if (body.docs != undefined && body.docs != null) {
            res.render('index.ejs', {
                projects:JSON.stringify({projects:pro})//.projects -> array
            });
        } else {
            res.redirect("/error?r=result_contains_no_project_docs");
        }



    });



   
});
app.get('/error', function (req, res) {
    sess = req.session;
    res.render('error.ejs', {
        err:req.query.r
    });
});



app.get('/partlist.json', function (req, res) {
    var q = {
        "selector": {
            "_id": {
                "$gt": null
            }
        }
    };
    pbm_db_parts.find(q, (err, body, header) => {
        if (err) {
            console.log('Error thrown: ', err.message);
            return;
        }
        var arr = [];
        var arr_keyword = [];
        if (body.docs.length > 0) {
            for (let index = 0; index < body.docs.length; index++) {
                const element = body.docs[index];
                arr.push(element);

                arr_keyword.push(element.part_id);
                arr_keyword.push(element.title);
            }
        }
        var part_data = {
            items: body.docs.length,
            export_timestamp: Math.floor(Date.now() / 1000),
            parts: arr,
            part_search_list: arr_keyword
        };
        res.json(part_data);
    });
});



app.get('/part', function (req, res) {
    sess = req.session;

    if(req.query.id == undefined || req.query.id == null || req.query.id == ""){
        res.redirect("/error?r=no_part_id_given");
    }
    res.render('part.ejs', {
        pid:req.query.id
    });
});


app.get('/project', function (req, res) {
    sess = req.session;

    var q = {
        "selector": {
            "_id": {
                "$gt": null
            },
            "project_id": req.query.id
        }
    };
    pbm_db_projects.find(q, (err, body, header) => {
        if (err) {
            console.log('Error thrown: ', err.message);
            res.redirect("/error?r=db_query_error_project_find");
            return;
        }
        if(body.docs.length <= 0){
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_project_with_this_id_found");
        }
        var project_doc = body.docs[0];



        if (body.docs != undefined && body.docs != null) {
            res.render('project.ejs', {
                pid: req.query.id,
                project_data_str: JSON.stringify(body.docs[0])
            });
        } else {
            res.redirect("/error?r=result_contains_no_project_docs");
        }



    });

});







io.on('connection', (socket) => {
    var addedUser = false;

    /**
     * 
     * 
     * contriols für project state mit btn group open close shipping, wait parts wait step complete
     * socket.emit('request_part_add_part', {
                project_id: project_data_str_init.project_id,
                part_id: pid,
                amount: am
            });




             socket.emit('request_state_change', {
                            project_id: project_data_str_init.project_id,
                            state:_st
                        });

                        
     */
    socket.on('request_part_add_part', (username) => {
        //project_id
        //
        console.log("add");
    });


    socket.on('request_part_amount_change', (username) => {
        //project_id
        //
        console.log("ch");
    });

    socket.on('request_new_project_data', (username) => {
        if (username == undefined || username == null || username.project_id == undefined || username.project_id == null) {
            return;
        }
        var q = {
            "selector": {
                "_id": {
                    "$gt": null
                },
                "project_id": username.project_id
            }
        };
        pbm_db_projects.find(q, (err, body, header) => {
            if (err) {
                console.log('Error thrown: ', err.message);
                return;
            }
            var project_doc = body.docs[0];
            if (body.docs != undefined && body.docs != null) {

                socket.emit('response_new_project_data', {
                    project_data_str: project_doc
                });

            } else {
                res.redirect("/");
            }



        });





    });








});
// when the client emits 'add user', this listens and executes
//


// we store the username in the socket session for this client
