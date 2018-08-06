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
var barcode = require('barcode');
var sanitizer = require('sanitizer');
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





// CREATES A LIST OF ALL INCONS INCL. NAME AND FILEPATH
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
readFiles('./public/img/part_icons', '/img/part_icons', function (filename, content) { }, function (err) {
    console.log("[ERR] : cant create part_icons_list.json");
});





app.get('/parts', function (req, res) {
    var q = {
        "selector": {
            "_id": {
                "$gt": null
            },
        }
    };

    pbm_db_parts.find(q, (err, body, header) => {
        if (err) {
            console.log('Error thrown: ', err.message);
            res.redirect("/error?r=db_query_error_part_find");
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_part_create_a_new_one");
        }
        var project_doc = body.docs[0];
        var pro = [];

        for (let index = 0; index < body.docs.length; index++) {
            const element = body.docs[index];


            //SKIP DELETED DOCS
            if (element.deleted != undefined && element.deleted) {
                continue;
            }
            pro.push(element);
        }

        if (body.docs != undefined && body.docs != null) {
            res.render('partlist.ejs', {
                parts: JSON.stringify({ parts: pro })//.projects -> array
            });
        } else {
            res.redirect("/error?r=result_contains_no_parts_docs");
        }
    });

});







//SHOWS ALL PROJECTS AT THE INDEX HTML
app.get('/', function (req, res) {
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
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_projects_create_a_new_one");
        }
        var project_doc = body.docs[0];
        var pro = [];

        for (let index = 0; index < body.docs.length; index++) {
            const element = body.docs[index];


            //SKIP DELETED DOCS
            if (element.deleted != undefined && element.deleted) {
                continue;
            }
            pro.push(element);
        }

        if (body.docs != undefined && body.docs != null) {
            res.render('index.ejs', {
                projects: JSON.stringify({ projects: pro })//.projects -> array
            });
        } else {
            res.redirect("/error?r=result_contains_no_project_docs");
        }
    });




});






app.get('/error', function (req, res) {
    res.render('error.ejs', {
        err: sanitizer.sanitize(req.query.r)
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
    res.render('part.ejs', {
        pid: null,
        project_data_str: null
    });
    res.finished = true;
    return;


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
            //   res.redirect("/error?r=db_query_error_project_find");
            // res.finished = true;
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            //    res.redirect("/error?r=no_project_with_this_id_found");
            //  res.finished = true;
            return;
        }
        if (body.docs != undefined && body.docs != null) {
            var project_doc = body.docs[0];

            if (project_doc.deleted) {
                //    res.redirect("/error?r=project_was_deleted");
                res.finished = true;
                return;
            }

            res.render('part.ejs', {
                pid: sanitizer.sanitize(req.query.id),
                project_data_str: JSON.stringify(project_doc)
            });
            res.finished = true;
            return;
        } else {
            //      res.redirect("/error?r=result_contains_no_project_docs");
            //        res.finished = true;
        }
    });

});


app.get('/project', function (req, res) {


    res.render('project.ejs', {
        pid: null,
        project_data_str: null
    });
    res.finished = true;
    return;


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
            res.finished = true;
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_project_with_this_id_found");
            res.finished = true;
            return;
        }
        if (body.docs != undefined && body.docs != null) {
            var project_doc = body.docs[0];

            if (project_doc.deleted) {
               res.redirect("/error?r=project_was_deleted");
                res.finished = true;
                return;
            }

            res.render('project.ejs', {
                pid: sanitizer.sanitize(req.query.id),
                project_data_str: JSON.stringify(project_doc)
            });
            res.finished = true;
            return;
        } else {
            res.redirect("/error?r=result_contains_no_project_docs");
           res.finished = true;
        }
    });

});


function generate_step_id(_array_len) {
    return String(_array_len) + "-" + randomstring.generate({
        length: 7,
        charset: 'abcdefghijklmnopqrstuvwxyz'
    });
}


//seperate function to use in a barcode system ean13 system
function generate_project_id() {
    return randomstring.generate({
        length: 13,
        charset: String(Math.round(new Date().getTime() / 1000))
    });
}


//this is a project inital entry in the db to create a new project
var project_db_entry_template = {
    project_id: "1337",
    tile: "Patient Service Signal",
    desc: "A singla light for the avatar state",
    status: "open",
    revision: "0",
    created: null,
    last_update: null,
    deleted: false,
    file_storage: [

    ],
    additional_propteries: [

    ],
    parts: [

    ],
    step_history: [

    ],
    deleted: false
};
//and a template for a step
var project_db_entry_template_step_history = {
    id: "-1",
    title: "Project was created",
    desc: "---",
    timestamp: 1531152389
};


var project_db_entry_template_add_properties = {
    key: "TYPE",
    value: "PAID"
}


var project_db_entry_template_file_storage = {
    fid: "3131231",
      name: "3D Files -Thingiverse",
    url: "https://www.thingiverse.com/thing:2988136"
}
//-> creates a new project and redirect it to the new project page /project id=123 if failed error page
//< form action = "/create_project"
//method = "POST" >
app.post('/create_project', function (req, res) {
    if (req.body.project_name == undefined || req.body.project_desc == undefined || sanitizer.sanitize(req.body.project_name) == "" || sanitizer.sanitize(req.body.project_desc) == "") {
        res.redirect("/error?r=project.desc_or_project_name not set in request");
        res.finished = true;
        return;
    }
    //generate a pid
    var pid = uuidv1();
    //pid = String(pid).replace("-","");
    var ptpl = project_db_entry_template;
    ptpl._id = pid;
    ptpl.project_id = generate_project_id();
    //set title and description
    ptpl.tile = sanitizer.sanitize(req.body.project_name);
    ptpl.desc = sanitizer.sanitize(req.body.project_desc);
    //set timestamps
    ptpl.created = Math.round(new Date().getTime() / 1000);
    ptpl.last_update = Math.round(new Date().getTime() / 1000);
    //insert initial step
    var step_tpl = project_db_entry_template_step_history;
    step_tpl.timestamp = ptpl.last_update;
    step_tpl.id = generate_step_id(0);
    ptpl.step_history.push(step_tpl);
    //Add a custom prop to it if you want
    var aptmp = project_db_entry_template_add_properties;
    aptmp.key = "KATEGORY";
    aptmp.value = "PAID";
    //ptpl.additional_propteries.push(aptmp);
    //write to db and redirect to project
    pbm_db_projects.insert(ptpl, function (err, body) {
        if (err) {
            console.log(body);
            res.redirect("/error?r=db insert failed please check your db");
            res.finished = true;
            return;
        }
        console.log(body)
        res.redirect("/project?id=" + pid + "");
        res.finished = true;
    });
    return;
});



app.post('/project_delete', function (req, res) {
    if (req.body.pid == undefined || sanitizer.sanitize(req.body.pid) == "") {
        res.redirect("/error?r=pid_not_set_in_request");
        res.finished = true;
        return;
    }
    //get project doc form db
    var q = {
        "selector": {
            "_id": {
                "$gt": null
            },
            "project_id": sanitizer.sanitize(req.body.pid)
        }
    };
    //get project entry in db
    pbm_db_projects.find(q, (err, body, header) => {
        if (err) {
            console.log('Error thrown: ', err.message);
            res.redirect("/error?r=db_query_error_project_find_project_delete");
            res.finished = true;
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_project_with_this_id_found_project_delete");
            res.finished = true;
            return;
        }
        if (body.docs != undefined && body.docs != null) {
            //change delted attribut to true
            var project_doc = body.docs[0];
            project_doc.deleted = true;
            //insert it back again to save a revsion
            pbm_db_projects.insert(project_doc, function (err, body) {
                if (err) {
                    console.log(body);
                    res.redirect("/error?r=db_insert_failed_please_check_your_db_project_delete");
                    res.finished = true;
                    return;
                }
                console.log(body)
                res.redirect("/");
                res.finished = true;
            });
        } else {
            res.redirect("/error?r=result_contains_no_project_docs_project_delete");
            res.finished = true;
        }
    });
    return;
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



                        //project_update
                        
     */




    /*


    - > wenn neues project geadded sende an project_update alle projecte s. get /
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
        username = sanitizer.sanitize(username);
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
                //    throw;
            }
        });
    });








});
// when the client emits 'add user', this listens and executes
//


// we store the username in the socket session for this client
