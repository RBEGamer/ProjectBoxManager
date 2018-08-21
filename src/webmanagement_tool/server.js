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
var fileUpload = require('express-fileupload');
var cron = require('node-cron');
var RSS = require('rss');


var hostname = process.env.HOSTNAME || config.hostname || "http://127.0.0.1:3000/";

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
app.use(fileUpload());


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






//INVENTUR GET
app.get('/inventur', function (req, res) {
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
            res.redirect("/error?r=db_query_error_part_inventur_find");
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_parts_found_please_add_one_inventur");
        }
        var project_doc = body.docs[0];
        var pro = [];

        for (let index = 0; index < body.docs.length; index++) {
            const element = body.docs[index];


            //SKIP DELETED DOCS
            if (element.inventur_state && element.inventur_state.inventur_active) {
                pro.push(element);
            } else {
                continue;
            }

        }

        if (body.docs != undefined && body.docs != null) {
            res.render('inventur.ejs', {
                inventur_list: JSON.stringify({ parts: pro }),//.projects -> array
            });
        } else {
            res.redirect("/error?r=result_contains_no_parts_docs");
        }
    });

});






















//GET A COMPLETE PART LIST
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
                parts: JSON.stringify({ parts: pro }),//.projects -> array
                valid_categories: valid_categories
            });
        } else {
            res.redirect("/error?r=result_contains_no_parts_docs");
        }
    });

});



var new_part_db_entry_template = {

    part_id: "",
    title: "",
    desc: "",
    stock: "0",
    location: "",
    keywords: [

    ],
    image_url: "/img/part_images/part_default.png",
    additional_attributes: [
    ],
    supplier: [

    ],
    datasheet_url: "",
    deleted: false,
    category: "",
    inventur_state: {
        last_inventur: "",
        inventur_finished: "",
        inventur_started: "",
        inventur_active: false
    },
};


var new_part_db_additional_attributes_template = {
    key: "",
    value: ""
};

var new_part_db_supplier_template = {
    shopname: "",
    url: ""
};


const valid_categories = [
    "MECHANIC",
    "OPTIC",
    "ELECTRIC",
    "TOOLS",
    "MISC",
    "CHEMICAL"
];

function generate_part_id() {
    return randomstring.generate({
        length: 13,
        charset: String(Math.round(new Date().getTime() / 1000))
    });
}



//TO CREATE A NEW PART IN THE DATABASE WITH FILEUPLOAD FOR IMAGES
app.post('/create_part', function (req, res) {
    //console.log(req.body);
    if (!req.body.new_part_title || !req.body.new_part_description || !req.body.new_part_tags || !req.body.new_part_stock) {
        res.redirect("/error?r=please_fill_in_all_required_fileds");
        return;
    }





    var tmp = new_part_db_entry_template;
    tmp._id = uuidv1();
    tmp.part_id = generate_part_id();
    tmp.title = sanitizer.sanitize(req.body.new_part_title);
    tmp.desc = sanitizer.sanitize(req.body.new_part_description);
    tmp.stock = sanitizer.sanitize(req.body.new_part_stock);
    tmp.keywords = sanitizer.sanitize(req.body.new_part_stock).split(",");

    tmp.location = sanitizer.sanitize(req.body.new_part_location);

    if (req.body.new_part_aa) {
        for (let indexaa = 0; indexaa < req.body.new_part_aa.length; indexaa++) {
            const element = array[indexaa];
            var sp = String(sanitizer.sanitize(element)).split(",");
            var aa_tmpl = new_part_db_additional_attributes_template;
            if (sp.length <= 1) {
                aa_tmpl.value = String(sanitizer.sanitize(element));
            } else {
                aa_tmpl.key = sp[0];
                aa_tmpl.value = sp[1];
            }
            tmp.additional_attributes.push(aa_tmpl);
        }
    } else {
        tmp.additional_attributes = [];
    }


    //CHECK FOR VALID CATEGORY
    if (req.body.category && valid_categories) {
        var was_in_cat = false;
        for (let indexc = 0; indexc < valid_categories.length; indexc++) {
            const elementc = array[indexc];
            if (sanitizer.sanitize(req.body.category) == elementc) {
                was_in_cat = true;
                tmp.category = elementc;
                break;
            }
        }
        if (!was_in_cat) {
            tmp.category = "MISC";
        }
    } else {
        tmp.category = "MISC"; //INVALID CATEGORY> -> is misc category
    }
    //check part supplier
    if (req.body.new_part_supplier) {
        for (let indexsp = 0; indexsp < req.body.new_part_supplier.length; indexsp++) {
            const element = array[indexsp];
            var sp = String(sanitizer.sanitize(element)).split(",");
            var sp_tmpl = new_part_db_supplier_template;
            if (sp.length <= 1) {
                sp_tmpl.shopname = String(sanitizer.sanitize(element));
            } else {
                sp_tmpl.shopname = sp[0];
                sp_tmpl.url = sp[1];
            }
            tmp.supplier.push(sp_tmpl);
        }
    } else {
        tmp.supplier = [];
    }
    // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file


    if (req.files && req.files.new_part_image) {
        let imf = req.files.new_part_image;
        var ext = imf.name;
        var fin_path = "./public/img/part_images/" + String(tmp.part_id) + "-" + ext;
        tmp.image_url = "/img/part_images/" + String(tmp.part_id) + "-" + ext;
        imf.mv(fin_path, function (err) {
            //TODO CHECK SUCCESS
            console.log(err);
        });
    }


    if (req.files && req.files.new_part_datasheet) {
        let imd = req.files.new_part_datasheet;
        var extd = imd.name;
        var fin_path_d = "./public/part_datasheets/" + String(tmp.part_id) + "-" + extd;
        tmp.datasheet_url = "/part_datasheets/" + String(tmp.part_id) + "-" + extd;
        imd.mv(fin_path_d, function (err) {
            //TODO CHECK SUCCESS
            console.log(err);
        });
    }
    //INVENTUR SYSTEM SETUP
    tmp.inventur_state.last_inventur = Math.round(new Date().getTime() / 1000);
    tmp.inventur_state.inventur_active = false;
    tmp.inventur_state.inventur_finished = Math.round(new Date().getTime() / 1000);
    tmp.inventur_state.inventur_started = Math.round(new Date().getTime() / 1000);
    //UPDATE DB
    pbm_db_parts.insert(tmp, function (err, body) {
        if (err) {
            console.log(body);
            res.redirect("/error?r=db insert failed please check your db");
            res.finished = true;
            return;
        }
      //  console.log(body);
        res.redirect("/part?id=" + String(tmp.part_id));
        res.finished = true;
    });
    return;
});


app.post('/part_delete', function (req, res) {
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
            "part_id": sanitizer.sanitize(req.body.pid)
        }
    };
    //get project entry in db
    pbm_db_parts.find(q, (err, body, header) => {
        if (err) {
            console.log('Error thrown: ', err.message);
            res.redirect("/error?r=db_query_error_part_find_project_delete");
            res.finished = true;
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_part_with_this_id_found_project_delete");
            res.finished = true;
            return;
        }
        if (body.docs != undefined && body.docs != null) {
            //change delted attribut to true
            var project_doc = body.docs[0];
            project_doc.deleted = true;
            //insert it back again to save a revsion
            pbm_db_parts.insert(project_doc, function (err, body) {
                if (err) {
               //     console.log(body);
                    res.redirect("/error?r=db_insert_failed_please_check_your_db_part_delete");
                    res.finished = true;
                    return;
                }
                //console.log(body);
                res.redirect("/parts");
                res.finished = true;
            });
        } else {
            res.redirect("/error?r=result_contains_no_part_docs_project_delete");
            res.finished = true;
        }
    });
    return;
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



    var department = "";


    if (req.query.dep) {
        department = sanitizer.sanitize(req.query.dep);
        //console.log(department);

    }

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
                projects: JSON.stringify({ projects: pro }),//.projects -> array
                dep: department
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
            },

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
                //SKIP HIDDEN PARTS
                if (element.deleted) {
                    continue;
                }
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




    var q = {
        "selector": {
            "_id": {
                "$gt": null
            },
            "part_id": req.query.id
        }
    };
    pbm_db_parts.find(q, (err, body, header) => {
        if (err) {
            console.log('Error thrown: ', err.message);
            res.redirect("/error?r=db_query_error_part_find");
            res.finished = true;
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            res.redirect("/error?r=no_part_with_this_id_found");
            res.finished = true;
            return;
        }
        if (body.docs != undefined && body.docs != null) {
            var project_doc = body.docs[0];

            if (project_doc.deleted) {
                res.redirect("/error?r=part_was_deleted");
                res.finished = true;
                return;
            }

            res.render('part.ejs', {
                pid: sanitizer.sanitize(req.query.id),
                part_data_str: JSON.stringify(project_doc)
            });

            return;
        } else {
            res.redirect("/error?r=result_contains_no_part_docs");
            res.finished = true;
            return;
        }
    });

});


app.get('/project', function (req, res) {




    var q = {
        "selector": {
            "_id": {
                "$gt": null
            },
            "project_id": sanitizer.sanitize(req.query.id)
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

            return;
        } else {
            res.redirect("/error?r=result_contains_no_project_docs");
            res.finished = true;
            return;
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
    deleted: false,
    current_next_step: null
};
//and a template for a step
var project_db_entry_template_step_history = {
    id: "-1",
    title: "Project was created",
    desc: "---",
    timestamp: 1531152389,
    type: "default",
    interactive: false,
    url: "/"
};


var project_db_entry_template_add_properties = {
    key: "TYPE",
    value: "PAID"
};


var project_db_entry_template_file_storage = {
    fid: "3131231",
    name: "3D Files -Thingiverse",
    url: "https://www.thingiverse.com/thing:2988136"
};


var project_db_entry_template_part = {
    pid: "",
    amount: 0
};
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
    step_tpl.type = "success";
    ptpl.step_history.push(step_tpl);

    current_next_step = step_tpl;
    //Add a custom prop to it if you want
    var aptmp = project_db_entry_template_add_properties;
    aptmp.key = "KATEGORY";
    aptmp.value = "PAID";
    //ptpl.additional_propteries.push(aptmp);
    //write to db and redirect to project
    pbm_db_projects.insert(ptpl, function (err, body) {
        if (err) {
          //  console.log(body);
            res.redirect("/error?r=db insert failed please check your db");
            res.finished = true;
            return;
        }
        //console.log(body)
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
                  //  console.log(body);
                    res.redirect("/error?r=db_insert_failed_please_check_your_db_project_delete");
                    res.finished = true;
                    return;
                }
               // console.log(body)
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



    socket.on('request_state_change', (data) => {

        if (!data.state || !data.client_id || !data.project_id) {
            console.log("err data not all attr are set");
            socket.emit('error_message_show', {
                message: "invalid part_add request",
                for_client_id: data.client_id
            });
            return;
        }

        if (!data.department) {
            data.department = "---";
        }

        var q = {
            "selector": {
                "_id": {
                    "$gt": null
                },
                "project_id": sanitizer.sanitize(data.project_id)
            }
        };
        pbm_db_projects.find(q, (err, body, header) => {
            if (err) {
                console.log('Error thrown: ', err.message);
                socket.emit('error_message_show', {
                    message: err.message,
                    for_client_id: data.client_id
                });
                return;
            }
            if (body.docs != undefined && body.docs != null) {
                var project_doc = body.docs[0];
           //     console.log(project_doc);
                if (!project_doc.parts) {
                    console.log("no part array present - adding one please check project template json");
                    project_doc.parts = [];
                }
                var step_id = 0;
                if (project_doc.step_history) {
                    step_id = project_doc.step_history.length;
                }
                //NOW SET ALL NEW VALUES
                project_doc.last_update = Math.floor(Date.now() / 1000);
                project_doc.status = sanitizer.sanitize(data.state);

                var step_tpl = project_db_entry_template_step_history;
                step_tpl.timestamp = project_doc.last_update;
                step_tpl.id = generate_step_id(step_id);
                step_tpl.type = "default";
                step_tpl.interactive = false;
                step_tpl.desc = String(sanitizer.sanitize(data.reasson));
                step_tpl.title = "" + String(sanitizer.sanitize(data.state)).toLocaleUpperCase();
                step_tpl.department = String(sanitizer.sanitize(data.department)).toLocaleUpperCase();
                project_doc.step_history.push(step_tpl);
                project_doc.current_next_step = step_tpl; //SET THIS SET AS NEW STEP

                //SAFE IN DB AND SEND OK BACK
                pbm_db_projects.insert(project_doc, function (err, body) {
                    if (err) {
                //        console.log(body);
                        socket.emit('error_message_show', {
                            message: "Project db save failed",
                            for_client_id: data.client_id,
                            error: true
                        });
                        return;
                    }
                    //and send a refresh of the project
                    //TODO BROADCAST and client check projject id for refresh
                    socket.emit('response_new_project_data', {
                        project_data_str: project_doc
                    });

                    step_tpl.desc = String(sanitizer.sanitize(data.reasson));

                    var rss_desc = project_doc.desc;

                    if (project_doc.current_next_step.desc) {
                        rss_desc = project_doc.current_next_step.desc;
                    }
                    rss_add_project_update(project_doc.tile, rss_desc, project_doc.project_id);
                    return;
                });



            } else {
                //    throw;
                socket.emit('error_message_show', {
                    message: "no project with this id found, was the project deleted",
                    for_client_id: data.client_id,
                    error: true
                });
            }
        });

        console.log("state_ch");
        console.log(data);
        //change state
        //add new step to step histroy with reason

    });

    socket.on('request_part_add_part', (data) => {
        //project_id
        //
        console.log("add");
        console.log(data);


        // project_id: '1337',part_id: 'Nema 17 Stepper Motoro',amount: '1'

        if (!data.project_id || !data.part_id) {
            console.log("err data not all attr are set");
            socket.emit('error_message_show', {
                message: "invalid part_add request",
                for_client_id: data.client_id
            });
            return;
        }
        var amount_to_add = sanitizer.sanitize(data.amount) || 1;
        //IF ADDED -> message
        //1st get the project from the database
        var q = {
            "selector": {
                "_id": {
                    "$gt": null
                },
                "project_id": sanitizer.sanitize(data.project_id)
            }
        };
        pbm_db_projects.find(q, (err, body, header) => {
            if (err) {
                console.log('Error thrown: ', err.message);
                socket.emit('error_message_show', {
                    message: err.message,
                    for_client_id: data.client_id
                });
                return;
            }

            if (body.docs != undefined && body.docs != null) {
                var project_doc = body.docs[0];

               // console.log(project_doc);


                if (!project_doc.parts) {
                    console.log("no part array present - adding one please check project template json");
                    project_doc.parts = [];
                }

                //->now we have the document of the project

                //1st we check now if the part is already in the project
                var was_in = false;
                for (let index = 0; index < project_doc.parts.length; index++) {
                    const part_element = project_doc.parts[index];
                    if (part_element.pid && part_element.pid == sanitizer.sanitize(data.part_id)) {
                        //PART EXISTING IN PROJECT so we add the amount
                        project_doc.parts[index].amount = parseInt(project_doc.parts[index].amount, 10) + parseInt(amount_to_add, 10);
                        was_in = true;
                        break;
                    }

                }
                //2nd if items was not already existing add a new entry
                if (!was_in) {

                    //1st check if part exists in database
                    var qpart = {
                        "selector": {
                            "_id": {
                                "$gt": null
                            },
                            "part_id": sanitizer.sanitize(data.part_id)
                        }
                    };
                    pbm_db_parts.find(qpart, (err, bodyp, header) => {
                        if (err) {
                            console.log('Error thrown: ', err.message);
                            socket.emit('error_message_show', {
                                message: err.message,
                                for_client_id: data.client_id,
                                error: true
                            });
                            return;
                        }
                        //part exists
                        if (body.docs.length == 1) {
                            //2nd create a new part entry and push it to the project
                            var part_template = project_db_entry_template_part;
                            part_template.amount = amount_to_add;
                            part_template.pid = sanitizer.sanitize(data.part_id);
                            project_doc.parts.push(part_template);


                            //SAFE IN DB AND SEND OK BACK
                            pbm_db_projects.insert(project_doc, function (err, body) {
                                if (err) {
                                 //   console.log(body);
                                    socket.emit('error_message_show', {
                                        message: "Project db save failed",
                                        for_client_id: data.client_id,
                                        error: true
                                    });
                                    return;
                                }
                                //and send a refresh of the project
                                //TODO BROADCAST and client check projject id for refresh
                                socket.emit('response_new_project_data', {
                                    project_data_str: project_doc
                                });
                                return;
                            });



                            return;
                        } else {
                            socket.emit('error_message_show', {
                                message: "please add the part first or remove a duplicate from the database",
                                for_client_id: data.client_id,
                                error: true
                            });
                            return;
                        }

                    });





                    return;
                }

                //SAFE IN DB AND SEND OK BACK
                pbm_db_projects.insert(project_doc, function (err, body) {
                    if (err) {
                  //      console.log(body);
                        socket.emit('error_message_show', {
                            message: "Project db save failed",
                            for_client_id: data.client_id,
                            error: true
                        });
                        return;
                    }
                    //and send a refresh of the project
                    //TODO BROADCAST and client check projject id for refresh
                    socket.emit('response_new_project_data', {
                        project_data_str: project_doc
                    });
                    return;
                });



            } else {
                //    throw;
                socket.emit('error_message_show', {
                    message: "no project with this id found, was the project deleted",
                    for_client_id: data.client_id,
                    error: true
                });
            }
        });



        //last emit response_new_project_data

    });








    socket.on('request_part_amount_change', (data) => {
        console.log("ch");
     //   console.log(data);

        if (!data.project_id || !data.part_id || !data.amount) {
            console.log("err data not all attr are set");
            socket.emit('error_message_show', {
                message: "invalid part_add request",
                for_client_id: data.client_id,
                error: true
            });
            return;
        }


        var qp = {
            "selector": {
                "_id": {
                    "$gt": null
                },
                "project_id": sanitizer.sanitize(data.project_id)
            }
        };
        pbm_db_projects.find(qp, (err, body, header) => {
            if (err) {
                socket.emit('error_message_show', {
                    message: err.message,
                    for_client_id: data.client_id,
                    error: true
                });
                return;
            }

            if (body.docs != undefined && body.docs != null) {
                var project_doc = body.docs[0];

                //1st check if part in project exists
                if (!project_doc.parts) {
                    socket.emit('error_message_show', {
                        message: "part not added to the project",
                        for_client_id: data.client_id,
                        error: true
                    });
                    return;
                }

                //->now we have the document of the project

                //1st we check now if the part is already in the project
                var was_in = false;



                for (let index = 0; index < project_doc.parts.length; index++) {
                    const part_element = project_doc.parts[index];
                    if (part_element.pid && part_element.pid == sanitizer.sanitize(data.part_id)) {
                        //PART EXISTING IN PROJECT so we add the amount
                        project_doc.parts[index].amount = parseInt(data.amount, 10);
                        //if amount == 0 delete part
                        if (project_doc.parts[index].amount <= 0) {

                            var new_part_array = [];

                            for (let indexpd = 0; indexpd < project_doc.parts.length; indexpd++) {
                                const parts_element = project_doc.parts[indexpd];
                                if (indexpd != index) {
                                    new_part_array.push(parts_element);
                                }
                            }

                            project_doc.parts = new_part_array;
                            //TODO REMOVE PART
                            //1st create new part array
                            //safe to prokject doc
                        }
                        was_in = true;
                        break;
                    }

                }

                if (was_in) {
                    //safe in db 

                    //SAFE IN DB AND SEND OK BACK
                    pbm_db_projects.insert(project_doc, function (err, body) {
                        if (err) {
                         //   console.log(body);
                            socket.emit('error_message_show', {
                                message: "Project db save failed:" + err.message,
                                for_client_id: data.client_id,
                                error: true
                            });
                            return;
                        }
                        //and send a refresh of the project
                        //TODO BROADCAST and client check projject id for refresh
                        socket.emit('response_new_project_data', {
                            project_data_str: project_doc
                        });

                        socket.emit('error_message_show', {
                            message: "PART AMOUNT CHANGED",
                            for_client_id: data.client_id,
                            error: false
                        });

                        return;
                    });

                    return;
                } else {
                    //thriw error
                    socket.emit('error_message_show', {
                        message: "part not added to the project",
                        for_client_id: data.client_id,
                        error: true
                    });

                    return;
                }
            } else {
                //    throw;
                socket.emit('error_message_show', {
                    message: err.message,
                    for_client_id: data.client_id,
                    error: true
                });
                return;
            }
        });


    });




    //client requests the project document
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










    socket.on('inventur_amount_change', (data) => {
       // console.log("ch");
     //   console.log(data);

        if (!data.pid || !data.stock) {
            console.log("err data not all attr are set");
            socket.emit('error_message_show', {
                message: "invalid part_add request",
                for_client_id: data.client_id,
                error: true
            });
            return;
        }



        //SEACH PART IN DB
        //CHECK IF FINAL -> UPDATE INVENTUR DATA
        //
        var q = {
            "selector": {
                "_id": {
                    "$gt": null
                },
                "part_id": sanitizer.sanitize(data.pid)
            }
        };
        pbm_db_parts.find(q, (err, body, header) => {
            if (err) {
                console.log('Error thrown: ', err.message);
                socket.emit('error_message_show', {
                    message: err.message,
                    for_client_id: data.client_id,
                    error: true
                });
                return;
            }

            if (body.docs != undefined && body.docs != null) {
                var part_doc = body.docs[0];
                //SET INVENTUR FINISHED
                if (data.final) {
                    part_doc.inventur_state.inventur_active = false;
                    part_doc.inventur_state.last_inventur = Math.round(new Date().getTime() / 1000);
                    part_doc.inventur_state.inventur_finished = Math.round(new Date().getTime() / 1000);
                }
                //UPDATE STOCK
                part_doc.stock = data.stock;

                //SAVE TO DB
                pbm_db_parts.insert(part_doc, function (err, body) {
                    if (err) {
                     //   console.log(body);
                        socket.emit('error_message_show', {
                            message: err.message,
                            for_client_id: data.client_id,
                            error: true
                        });
                        return;
                    }


                    //RESEND COMPLETE INVENTUR DATA
                    var q1 = {
                        "selector": {
                            "_id": {
                                "$gt": null
                            },
                        }
                    };

                    pbm_db_parts.find(q1, (err, body, header) => {
                        if (err) {
                            console.log('Error thrown: ', err.message);
                            socket.emit('error_message_show', {
                                message: err.message,
                                for_client_id: data.client_id,
                                error: true
                            });
                            return;
                        }
                        if (body.docs.length <= 0) {
                            console.log('Error thrown: no projects found');
                            socket.emit('error_message_show', {
                                message: "part update failed please refresh",
                                for_client_id: data.client_id,
                                error: true
                            });
                        }

                        var pro = [];
                        //TODO _-------------------------------
                        for (let index = 0; index < body.docs.length; index++) {
                            const element = body.docs[index];


                            //SKIP DELETED DOCS
                            if (element.inventur_state && element.inventur_state.inventur_active) {
                                pro.push(element);
                            } else {
                                continue;
                            }

                        }

                        if (body.docs != undefined && body.docs != null) {
                            socket.emit('inventur_update', {
                                parts: pro,
                                for_client_id: data.client_id,
                            });
                        } else {
                            socket.emit('error_message_show', {
                                message: "result contains no parts",
                                for_client_id: data.client_id,
                                error: true
                            });
                        }
                    });







                    return;
                });





            } else {
                //    throw;
                socket.emit('error_message_show', {
                    message: "invalid part_id request",
                    for_client_id: data.client_id,
                    error: true
                });
            }
        });

    });







});






//RSS FEDD SETUP
var rss_feed = new RSS({
    title: 'ProjectBoxManagerFeed',
    description: 'The Project update feed for the ProjectBoxManager',
    feed_url: hostname + 'rss.xml',
    site_url: hostname,
    image_url: hostname + 'img/np_project_564791_000000.png',
    docs: hostname,
    managingEditor: 'ProjectBoxManager Administrator',
    webMaster: 'ProjectBoxManager Administrator',
    copyright: 'Marcel Ochsendorf | RBEGamer | RBEPrinter',
    language: 'en',
    categories: ['Project Updates', 'Part Updates', 'PDM'],
    pubDate: Date.now(),
    ttl: '5',
});

var rss_xml_feed = rss_feed.xml();

app.get('/feed.xml', function (req, res) {
    res.send(rss_xml_feed);
});

function rss_add_project_update(_title, _desc, _pid) {
    rss_feed.item({
        title: '[PROJECT_STATE_UPDATE]' + _title,
        description: _desc,
        url: hostname + 'project?id=' + String(_pid), // link to the item

        author: 'ProjectBoxManager Administrator', // optional - defaults to feed author property
        date: Date.now(), // any format that js Date can parse.
        categories: [
            String(_pid),
            _title,
            "project_state_update"
        ]
    });

    rss_xml_feed = rss_feed.xml();
}




//INVENTUR CRONJOB ALL 2 HOURS
cron.schedule('* 0-23 * * *', function () {

    //1st hole alle parts
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
            return;
        }
        if (body.docs.length <= 0) {
            console.log('Error thrown: no projects found');
            return;
        }


        for (let index = 0; index < body.docs.length; index++) {
            const element = body.docs[index];
            //SKIP DELETED DOCS
            if (element.deleted != undefined && element.deleted) {
                continue;
            }
            //SKIP ACTIVE INVENTUR
            if (element.inventur_state.inventur_active) {
                continue;
            }
            //if next inventur timestamp is over set inventur active
            var next_inventur = element.inventur_state.last_inventur + config.inventur_interval_in_seconds;
         //   console.log(next_inventur);
            if (next_inventur < Math.round(new Date().getTime() / 1000)) {
                //SET INVENTUR ACTIVE
                body.docs[index].inventur_state.inventur_active = true;
                body.docs[index].inventur_state.last_inventur = Math.round(new Date().getTime() / 1000);
                console.log("set inventur active for : " + body.docs[index].title + " " + body.docs[index].part_id);
                //WRITE TO DB
                pbm_db_parts.insert(body.docs[index], function (err, body) {
                    if (err) {
                     //   console.log(body);
                        return;
                    }
                    return;
                });

            }



        }


    });

});




// when the client emits 'add user', this listens and executes
//


// we store the username in the socket session for this client
