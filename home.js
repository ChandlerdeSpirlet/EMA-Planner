const express = require('express')
const bodyParser = require('body-parser')
const nunjucks = require('nunjucks')
const session = require('express-session')
const exp_val = require('express-validator')
var flash = require('connect-flash')
const ics = require('ics')
const { writeFileSync } = require('fs')
const { readFileSync } = require('fs')
const nodemailer = require("nodemailer");
'use strict';
const request = require('request');
const crypto = require('crypto');

console.log('ps_api' + process.env.ps_api);
const settings = {
  port: 8080,
  apiv4url: 'https://sandbox-api.paysimple.com/v4',
  username: 'APIUser156358',
  apikey: process.env.ps_api
}

function getAuthHeader(){
  let time = (new Date()).toISOString();
  let hash = crypto.createHmac('SHA256', settings.apikey).update(time).digest('base64');
  return 'PSSERVER ' + "accessid=" + settings.username + "; timestamp=" + time + "; signature=" + hash;
}

const app = express()

app.use(flash());
const port = process.env.PORT
// const port = 5000;
const router = express.Router()
app.use(exp_val())


const STRIPE_API = require('./api/stripe-functions.js')

app.set('view engine', 'html')
app.engine('html', nunjucks.render)
nunjucks.configure('views', { noCache: true })

app.use(express.static(__dirname))
app.use(bodyParser())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
router.use(bodyParser.json())
router.use(bodyParser.urlencoded({ extended: true }))
app.use('/', router)


const db = require('./database')
const { proc } = require('./database')
const { get } = require('http')
const { json } = require('body-parser')

app.use(session({
  secret: 'ema-Planner',
  resave: true,
  saveUninitialized: true,
  useCookieSession: true,
  cookie: { maxAge: 60 * 60 * 1000 }
}))

app.use(flash({ sessionKeyName: 'ema-Planner' }))

function convertToMoney(amount) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  })
  return formatter.format(amount / 100)
}

app.get('/token', (req, res) => {
  let options = {
    method: "POST",
    uri: settings.apiv4url + '/checkouttoken',
    headers: {
      Authorization: getAuthHeader()
    },
    body: {},
    json: true,
  };

  request(options, function(error, response, body) {
    if (!error && response && res.statusCode < 300) {
      res.json(body.Response);
      return;
    }
    res.status((response && response.statusCode) || 500).send(error);
  });
});



app.get('/', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/')
  } else {
    var event = new Date();
    var options_1 = { month: 'long' };
    var options_2 = { day: 'numeric' };
    month = event.toLocaleDateString('us-MT', options_1);
    day = event.toLocaleDateString('us-MT', options_2);
    const student_query = 'select level_name, count(level_name) from student_list group by level_name, belt_order order by belt_order;'
    db.any(student_query)
      .then(function (rows) {
        const stripe = require('stripe')(process.env.STRIPE_API_KEY)
        stripe.balance.retrieve((err, balance) => {
          if (balance) {
            const failure_query = 'select count(id_failed) as failed_num from failed_payments'
            db.one(failure_query)
              .then(function (row) {
                const checked_in_query = "select count(class_session_id) as week_count from class_signups where class_session_id in (select class_id from classes where starts_at >= (now() - interval '7 hours') - interval '7 days' and starts_at < (now() + interval '17 hours'));";
                db.any(checked_in_query)
                  .then(checked_week => {
                    const day_query = "select count(class_session_id) as day_count from class_signups where class_session_id in (select class_id from classes where starts_at >= (now() - interval '7 hours') - interval '24 hours' and starts_at < (now() - interval '7 hours'));"
                    db.any(day_query)
                      .then(days => {
                        res.render('home.html', {
                          balance_available: convertToMoney(balance.available[0].amount),
                          balance_pending: convertToMoney(balance.pending[0].amount),
                          checked_today: days,
                          checked_week: checked_week,
                          student_data: rows,
                          failure_num: row,
                          month: month,
                          day: day
                        })
                      })
                      .catch(err => {
                        console.log('Could not get checked in day numbers ' + err);
                        res.render('home.html');
                      })
                  })
                  .catch(err => {
                    console.log('Could not get checked in week numbers ' + err);
                    res.render('home.html');
                  })
              })
              .catch(function (err) {
                console.log('Could not get failed_payment count ' + err)
                res.render('home.html')
              })
          } else {
            console.log('Balance err: ' + err)
          }
        })
          .catch(function (err) {
            console.log('Could not run query to count students: ' + err)
          })
      })
  }
})

router.get('/home', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/')
  } else {
    res.redirect('/')
  }
})

router.get('/add_student', function (req, res) {
  // if (req.headers['x-forwarded-proto'] != 'https'){
  //    res.redirect('https://ema-planner.herokuapp.com/home/add_student')
  // } else {
  res.render('add_student', {
    barcode: '',
    first_name: '',
    last_name: '',
    addr_1: '',
    city: '',
    zip: '',
    email: '',
    phone: '',
    belt_color: '',
    belt_size: ''
  })
  // }
})

router.post('/add_student', function (req, res) {
  const item = {
    first_name: req.sanitize('first_name').trim(),
    last_name: req.sanitize('last_name').trim(),
    barcode: req.sanitize('barcode').trim(),
    addr_1: req.sanitize('addr_1').trim(),
    city: req.sanitize('city').trim(),
    zip: req.sanitize('zip').trim(),
    email: req.sanitize('email').trim(),
    phone: req.sanitize('phone').trim(),
    belt_color: req.sanitize('belt_color').trim(),
    belt_size: req.sanitize('belt_size').trim()
  }
  let level_id = 0
  let belt_num = 0
  switch (item.belt_color) {
    case ('Dragons White'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Gold'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Orange'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Green'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Purple'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Blue'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Red'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('Dragons Brown'):
      level_id = 'Dragons'
      belt_num = -1
      break
    case ('White'):
      level_id = 'Basic'
      belt_num = 0
      break
    case ('Gold'):
      level_id = 'Basic'
      belt_num = 0
      break
    case ('Orange'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('High Orange'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('Green'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('High Green'):
      level_id = 'Level 1'
      belt_num = 1
      break
    case ('Purple'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('High Purple'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('Blue'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('High Blue'):
      level_id = 'Level 2'
      belt_num = 2
      break
    case ('Red'):
      level_id = 'Level 3'
      belt_num = 3
      break
    case ('High Red'):
      level_id = 'Level 3'
      belt_num = 3
      break
    case ('Brown'):
      level_id = 'Level 3'
      belt_num = 3
      break
    case ('High Brown'):
      level_id = 'Level 2'
      belt_num = 3
      break
    case ('Black Belt'):
      level_id = 'Black Belt'
      belt_num = 5
      break
    default:
      level_id = 'Unknown'
      belt_num = 999
      break
  };
  const query = 'insert into student_list (barcode, first_name, last_name, addr_1, zip_code, city, belt_color, belt_size, email, phone_number, level_name, belt_order) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);'
  db.query(query, [item.barcode, item.first_name, item.last_name, item.addr_1, item.zip, item.city, item.belt_color, item.belt_size, item.email, item.phone, level_id, belt_num])
    .then(function (rows) {
      console.log('In .then')
      const redir_link = '/customerView/' + item.first_name + ' ' + item.last_name + '/' + item.email + '/' + item.phone + '/' + item.addr_1 + '/' + item.city + '/' + item.zip + '/' + item.barcode
      res.redirect(redir_link)
    })
    .catch(function (err) {
      res.redirect('/')
      console.log('ERROR is ' + err)
    })
})

function parseBelt(current_color, is_promotion) { //returns belt color, level, and belt_order value
  var belt_info = ['', '', 999]
  if (is_promotion) {
    switch (current_color) {
      case 'Dragons White':
        belt_info[0] = 'Dragons Gold';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Gold':
        belt_info[0] = 'Dragons Orange';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Orange':
        belt_info[0] = 'Dragons Green';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Green':
        belt_info[0] = 'Dragons Purple';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Purple':
        belt_info[0] = 'Dragons Blue';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Blue':
        belt_info[0] = 'Dragons Red';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Red':
        belt_info[0] = 'Dragons Brown';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Brown':
        belt_info[0] = 'White';
        belt_info[1] = 'Basic';
        belt_info[2] = 0;
        break;
      case 'White':
        belt_info[0] = 'Gold';
        belt_info[1] = 'Basic';
        belt_info[2] = 0;
        break;
      case 'Gold':
        belt_info[0] = 'Orange';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'Orange':
        belt_info[0] = 'High Orange';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'High Orange':
        belt_info[0] = 'Green';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'Green':
        belt_info[0] = 'High Green';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'High Green':
        belt_info[0] = 'Purple';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'Purple':
        belt_info[0] = 'High Purple';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'High Purple':
        belt_info[0] = 'Blue';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'Blue':
        belt_info[0] = 'High Blue';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'High Blue':
        belt_info[0] = 'Red';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'Red':
        belt_info[0] = 'High Red';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'High Red':
        belt_info[0] = 'Brown';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'Brown':
        belt_info[0] = 'High Brown';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'High Brown':
        belt_info[0] = 'Prep';
        belt_info[1] = 'Prep';
        belt_info[2] = 4;
        break;
      case 'Prep':
        belt_info[0] = 'Conditional';
        belt_info[1] = 'Conditional';
        belt_info[2] = 4;
        break;
      case 'Conditional':
        belt_info[0] = 'Black Belt';
        belt_info[1] = 'Black Belt';
        belt_info[2] = 5;
        break;
      default:
        console.log('Unknown belt color: ' + belt_color);
        belt_info = ['?', '?', 999];
        break;
    }
  } else {
    switch (current_color) {
      case 'Dragons White':
        belt_info[0] = 'Dragons White';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Gold':
        belt_info[0] = 'Dragons Gold';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Orange':
        belt_info[0] = 'Dragons Orange';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Green':
        belt_info[0] = 'Dragons Green';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Purple':
        belt_info[0] = 'Dragons Purple';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Blue':
        belt_info[0] = 'Dragons Blue';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Red':
        belt_info[0] = 'Dragons Red';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'Dragons Brown':
        belt_info[0] = 'Dragons Brown';
        belt_info[1] = 'Dragons';
        belt_info[2] = -1;
        break;
      case 'White':
        belt_info[0] = 'White';
        belt_info[1] = 'Basic';
        belt_info[2] = 0;
        break;
      case 'Gold':
        belt_info[0] = 'Gold';
        belt_info[1] = 'Basic';
        belt_info[2] = 0;
        break;
      case 'Orange':
        belt_info[0] = 'Orange';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'High Orange':
        belt_info[0] = 'High Orange';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'Green':
        belt_info[0] = 'Green';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'High Green':
        belt_info[0] = 'High Green';
        belt_info[1] = 'Level 1';
        belt_info[2] = 1;
        break;
      case 'Purple':
        belt_info[0] = 'Purple';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'High Purple':
        belt_info[0] = 'High Purple';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'Blue':
        belt_info[0] = 'Blue';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'High Blue':
        belt_info[0] = 'High Blue';
        belt_info[1] = 'Level 2';
        belt_info[2] = 2;
        break;
      case 'Red':
        belt_info[0] = 'Red';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'High Red':
        belt_info[0] = 'High Red';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'Brown':
        belt_info[0] = 'Brown';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'High Brown':
        belt_info[0] = 'High Brown';
        belt_info[1] = 'Level 3';
        belt_info[2] = 3;
        break;
      case 'Prep':
        belt_info[0] = 'Prep';
        belt_info[1] = 'Prep';
        belt_info[2] = 4;
        break;
      case 'Conditional':
        belt_info[0] = 'Conditional';
        belt_info[1] = 'Conditional';
        belt_info[2] = 4;
        break;
      case 'Black Belt':
        belt_info[0] = 'Black Belt';
        belt_info[1] = 'Black Belt';
        belt_info[2] = 5;
        break;
      default:
        console.log('Unknown belt color: ' + belt_color);
        belt_info = ['?', '?', 999];
        break;
    }
  }
  return belt_info;
}

router.get('/adminView', function (req, res) {
  STRIPE_API.getAllProductsAndPlans().then(products => {
    res.render('adminView.html', { products: products })
  })
})

router.get('/createProduct', (req, res) => {
  res.render('createProduct.html')
})

router.post('/createProduct', (req, res) => {
  STRIPE_API.createProduct(req.body).then(() => {
    res.render('createProduct.html', { success: true })
  })
})

router.post('/createPlan', (req, res) => {
  res.render('createPlan.html', {
    productID: req.body.productID,
    productName: req.body.productName
  })
})

router.post('/createPlanForReal', (req, res) => {
  STRIPE_API.createPlan(req.body).then(() => {
    res.render('createPlan.html', { success: true })
  })
})

router.get('/customerView/(:studentName)/(:studentEmail)/(:studentPhone)/(:studentAddr)/(:studentCity)/(:studentZip)/(:barcode)', (req, res) => {
  STRIPE_API.getAllProductsAndPlans().then(products => {
    products = products.filter(product => {
      return product.plans.length > 0
    })

    res.render('customerView.html', {
      products: products,
      studentName: req.params.studentName,
      studentEmail: req.params.studentEmail,
      studentPhone: req.params.studentPhone,
      studentAddr: req.params.studentAddr,
      studentCity: req.params.studentCity,
      studentZip: req.params.studentZip,
      barcode: req.params.barcode
    })
  })
})

router.get('/customerView', (req, res) => {
  STRIPE_API.getAllProductsAndPlans().then(products => {
    products = products.filter(product => {
      return product.plans.length > 0
    })

    res.render('customerView.html', {
      products: products
    })
  })
})

router.post('/signUp', (req, res) => {
  const product = {
    name: req.body.productName
  }

  const plan = {
    Id: req.body.planId,
    name: req.body.planName,
    amount: req.body.planAmount,
    interval: req.body.planInterval,
    interval_count: req.body.planIntervalCount
  }

  res.render('signUp.html', {
    product: product,
    plan: plan,
    studentEmail: req.body.studentEmail,
    studentName: req.body.studentName,
    studentPhone: req.body.studentPhone,
    studentAddr: req.body.studentAddr,
    studentCity: req.body.studentCity,
    studentZip: req.body.studentZip,
    barcode: req.body.barcode
  })
})

router.post('/processPayment', (req, res) => {
  const product = {
    name: req.body.productName
  }

  const plan = {
    Id: req.body.planId,
    name: req.body.planName,
    amount: req.body.planAmount,
    interval: req.body.planInterval,
    interval_count: req.body.planIntervalCount
  }

  STRIPE_API.createCustomerAndSubscription(req.body).then(() => {
    res.render('signUp.html', {
      product: product,
      plan: plan,
      success: true,
      studentEmail: req.body.studentEmail,
      studentName: req.body.studentName,
      studentPhone: req.body.studentPhone,
      studentAddr: req.body.studentAddr,
      studentCity: req.body.studentCity,
      studentZip: req.body.studentZip,
      barcode: req.body.barcode
    })
  }).catch(err => {
    res.render('signUp.html', {
      product: product,
      plan: plan,
      error: true,
      studentEmail: req.body.studentEmail,
      studentName: req.body.studentName,
      studentPhone: req.body.studentPhone,
      studentAddr: req.body.studentAddr,
      studentCity: req.body.studentCity,
      studentZip: req.body.studentZip,
      barcode: req.body.barcode
    })
  })
})

router.get('/class_history_student/(:barcode)', (req, res) => {
  const class_history_query = "select x.barcode, x.is_swat, to_char(y.starts_at,'Month DD, YYYY HH12:MI') as class_time, x.checked_in, y.class_type from class_signups x, classes y where x.class_session_id = y.class_id and x.barcode = $1 and (checked_in = true or is_swat = true) order by x.checked_in desc, y.starts_at;"
  db.any(class_history_query, [req.params.barcode])
    .then(rows => {
      res.render('class_history_student', {
        alert_message: '',
        class_data: rows
      })
    })
    .catch(err => {
      res.render('class_history_student', {
        alert_message: 'Unable to find classes with barcode ' + req.params.barcode + '. Error: ' + err,
        class_data: ''
      })
    })
})

router.get('/class_selector', (req, res) => {
  const query = "select x.class_id, (select count(class_session_id) from class_signups where class_session_id = x.class_id and checked_in = FALSE) as signed_up, (select count(class_session_id) from class_signups where class_session_id = x.class_id and checked_in = TRUE) as checked_in, to_char(x.starts_at, 'Month') as class_month, to_char(x.starts_at, 'DD') as class_day, to_char(x.starts_at, 'HH:MI PM') as class_time, to_char(x.ends_at, 'HH:MI PM') as end_time, x.level, x.class_type from classes x where to_char(x.starts_at, 'Month DD') = to_char(to_date($1, 'Month DD'), 'Month DD') order by x.starts_at;"
  var d = new Date();
  var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  month = months[d.getMonth()];
  day = d.getDate();
  const date_conversion = months + ' ' + day;
  console.log("Date is " + date_conversion);
  db.any(query, [date_conversion])
    .then(function (rows) {
      res.render('class_selector', {
        data: rows
      })
    })
    .catch(function (err) {
      console.log('error in getting classes ' + err)
      res.redirect('home')
    })
})

router.get('/class_selector_force/(:month)/(:day)', (req, res) => {
  const date_conversion = req.params.month + ' ' + req.params.day
  const query = "select x.class_id, (select count(class_session_id) from class_signups where class_session_id = x.class_id and checked_in = FALSE) as signed_up, (select count(class_session_id) from class_signups where class_session_id = x.class_id and checked_in = TRUE) as checked_in, to_char(x.starts_at, 'Month') as class_month, to_char(x.starts_at, 'DD') as class_day, to_char(x.starts_at, 'HH:MI PM') as class_time, to_char(x.ends_at, 'HH:MI PM') as end_time, x.level, x.class_type, x.can_view from classes x where to_char(x.starts_at, 'Month DD') = to_char(to_date($1, 'Month DD'), 'Month DD') order by x.starts_at;"
  db.any(query, [date_conversion])
    .then(function (rows) {
      res.render('class_selector', {
        data: rows
      })
    })
    .catch(function (err) {
      console.log('error in getting classes ' + err)
      res.redirect('home')
    })
})

router.get('/class_remove/(:barcode)/(:class_id)/(:class_level)/(:class_time)/(:class_type)/(:can_view)', (req, res) => {
  const remove_query = 'delete from class_signups where class_session_id = $1 and barcode = $2;'
  if (req.params.class_type == 'reg'){
    var update_count = "update student_list set reg_class = reg_class - 1 where barcode = $1";
  } else if (req.params.class_type == 'spar'){
    var update_count = "update student_list set spar_class = spar_class - 1 where barcode = $1";
  } else {
    console.log('Unrecognized class_type');
    var update_count = 'update student_list set spar_class = spar_class where barcode = $1';
  }
  db.none(update_count, [req.params.barcode])
    .then(update => {
      db.any(remove_query, [req.params.class_id, req.params.barcode])
        .then(function (rows) {
          res.redirect('https://ema-planner.herokuapp.com/class_checkin/' + req.params.class_id + '/' + req.params.class_level + '/' + req.params.class_time + '/' + req.params.class_type + '/' + req.params.can_view);
        })
        .catch(function (err) {
          console.log('Could not remove person from class with class_id and barcode ' + req.params.class_id + ', ' + req.params.barcode + '. Err: ' + err)
          res.redirect('https://ema-planner.herokuapp.com/class_selector')
        })
    })
    .catch(function (err) {
      console.log('Could not remove person from class with class_id and barcode ' + req.params.class_id + ', ' + req.params.barcode + '. Err: ' + err)
      res.redirect('https://ema-planner.herokuapp.com/class_selector')
    })
})

router.get('/update_checkin/(:barcode)/(:class_id)/(:class_level)/(:class_time)/(:class_check)/(:class_type)/(:can_view)', (req, res) => {
  const update_status = 'update class_signups set checked_in = true where class_check = $1;';
  const update_visit = "update student_list set last_visit = (select to_char(starts_at, 'Month DD, YYYY')::date as visit from classes where class_id = $1) where barcode = $2 and (last_visit < (select to_char(starts_at, 'Month DD, YYYY')::date as visit from classes where class_id = $3) or last_visit is null);"
  if (req.params.class_type == 'reg'){
    var update_count = "update student_list set reg_class = reg_class + 1 where barcode = $1";
  } else if (req.params.class_type == 'spar'){
    var update_count = "update student_list set spar_class = spar_class + 1 where barcode = $1";
  } else {
    console.log('Unrecognized class_type');
    var update_count = 'update student_list set spar_class = spar_class where barcode = $1';
  }
  db.none(update_count, [req.params.barcode])
    .then(update => {
      db.none(update_status, [req.params.class_check])
        .then(rows => {
          db.none(update_visit, [req.params.class_id, req.params.barcode, req.params.class_id])
            .then(row => {
              res.redirect('https://ema-planner.herokuapp.com/class_checkin/' + req.params.class_id + '/' + req.params.class_level + '/' + req.params.class_time + '/' + req.params.class_type + '/' + req.params.can_view);
            })
            .catch(err => {
              console.log('Could not update last_visit status of ' + req.params.class_session_id + '>  ' + err);
              res.redirect('https://ema-planner.herokuapp.com/class_checkin/' + req.params.class_id + '/' + req.params.class_level + '/' + req.params.class_time + '/' + req.params.class_type + '/' + req.params.can_view);
            })
        })
        .catch(err => {
          console.log('Could not update checked_in status of ' + req.params.class_session_id);
          res.redirect('https://ema-planner.herokuapp.com/class_checkin/' + req.params.class_id + '/' + req.params.class_level + '/' + req.params.class_time + '/' + req.params.class_type + '/' + req.params.can_view);
        })
    })
    .catch(err => {
      console.log('Could not update count of ' + req.params.barcode);
      res.redirect('https://ema-planner.herokuapp.com/class_checkin/' + req.params.class_id + '/' + req.params.class_level + '/' + req.params.class_time + '/' + req.params.class_type + '/' + req.params.can_view);
    })
})

router.get('/class_checkin/(:class_id)/(:class_level)/(:class_time)/(:class_type)/(:can_view)', (req, res) => {
  console.log('req.params.class_id = ' + req.params.class_id);
  const query = "select * from get_class_names($1);";
  const checked_in = "select student_name, barcode, class_check from class_signups where class_session_id = $1 and checked_in = true;";
  const query_reserved = "select s.student_name, s.class_check, s.barcode, s.is_swat from class_signups s where s.checked_in = false and s.class_session_id = $1;";
  db.any(checked_in, [req.params.class_id])
    .then(checkedIn => {
      db.any(query_reserved, [req.params.class_id])
        .then(signedup => {
          db.any(query, [Number(req.params.class_id)])
            .then(names => {
              res.render('class_checkin.html', {
                name_data: names,
                signedup: signedup,
                checkedIn: checkedIn,
                level: req.params.class_level,
                time: req.params.class_time,
                class_id: req.params.class_id,
                class_type: req.params.class_type,
                can_view: req.params.can_view,
                alert_message: ''
              })
            })
            .catch(function (err) {
              res.redirect('home')
              console.log('error finding class with id ' + err)
            })
        })
        .catch(err => {
          console.log("Could not pull people signed up for class. Err: " + err);
          res.redirect('home');
        })
    })
    .catch(err => {
      console.log('Could not find people checked in for class. Error: ' + err);
      res.redirect('https://ema-planner.herokuapp.com/home');
    })
})

router.post('/class_checkin', (req, res) => {
  const item = {
    class_id: req.sanitize('class_id').trim(),
    stud_data: req.sanitize('result').trim(),
    level: req.sanitize('level').trim(),
    time: req.sanitize('time').trim(),
    class_type: req.sanitize('class_type').trim(),
    can_view: req.sanitize('can_view').trim()
  }
  const update_visit = "update student_list set last_visit = (select to_char(starts_at, 'Month DD, YYYY')::date as visit from classes where class_id = $1) where barcode = $2 and (last_visit < (select to_char(starts_at, 'Month DD, YYYY')::date as visit from classes where class_id = $3) or last_visit is null);"
  if (item.class_type == 'reg'){
    var update_count = "update student_list set reg_class = reg_class + 1 where barcode = $1";
  } else if (item.class_type == 'spar'){
    var update_count = "update student_list set spar_class = spar_class + 1 where barcode = $1";
  } else {
    console.log('Unrecognized class_type');
    var update_count = 'update student_list set spar_class = spar_class where barcode = $1';
  }
  const stud_info = parseStudentInfo(item.stud_data);//name, barcode
  console.log('stud_info: ' + stud_info);
  const temp_class_check = stud_info[0].toLowerCase().split(" ").join("") + item.class_id.toString();
  const query = 'insert into class_signups (student_name, email, class_session_id, barcode, class_check, checked_in) values ($1, (select lower(email) from student_list where barcode = $2), $3, $4, $5, true) on conflict (class_check) do nothing;'
  db.any(update_count, [stud_info[1]])
    .then(update_c => {
      db.any(update_visit, [item.class_id, stud_info[1], item.class_id])
        .then(update => {
          db.any(query, [stud_info[0], stud_info[1], item.class_id, stud_info[1], temp_class_check])
            .then(function (rows1) {
              res.redirect('class_checkin/' + item.class_id + '/' + item.level + '/' + item.time + '/' + item.class_type + '/' + item.can_view)
            })
            .catch(function (err) {
              res.redirect('home')
              console.log('Unable to checkin to class ' + err)
            })
        })
        .catch(err => {
          res.redirect('home')
          console.log('Unable to update last visit for ' + stud_info + '. Error: ' + err);
        })
    })
    .catch(err => {
      res.redirect('home');
      console.log('Unable to update count for ' + stud_info + '. Error: ' + err);
    })
})

router.get('/failed_charges', (req, res) => {
  const query = 'select * from failed_payments'
  db.any(query)
    .then(function (rows) {
      res.render('failed_charges', {
        failed_payments: rows
      })
    })
    .catch(function (err) {
      console.log('Could not retrieve failed payments ' + err)
      res.render('failed_charges', {
        failed_payments: ''
      })
    })
})

router.get('/email_payment_failure/(:email)/(:amount)/(:reason)/(:customer)', (req, res) => {
  // Add email client to notify of failure.
  res.redirect('failed_charges')
})

router.get('/payment_resolved/(:id)', (req, res) => {
  const resolve_query = 'delete from failed_payments where id_failed = $1'
  db.none(resolve_query, [req.params.id])
    .then(function (row) {
      console.log('Payment was resolved.')
      const query = 'select * from failed_payments'
      db.any(query)
        .then(function (rows) {
          res.render('failed_charges', {
            failed_payments: rows
          })
        })
        .catch(function (err) {
          console.log('Could not retrieve failed payments ' + err)
          res.render('failed_charges', {
            failed_payments: ''
          })
        })
    })
    .catch(function (err) {
      console.log('Error resolving payment with id ' + req.params.id)
      res.redirect('/')
    })
})

router.get('/class_lookup', (req, res) => {
  var event = new Date();
  var options_1 = { month: 'long' };
  var options_2 = { day: 'numeric' };
  month = event.toLocaleDateString('us-MT', options_1);
  day = event.toLocaleDateString('us-MT', options_2);
  res.render('class_lookup', {
    month: month,
    day: day
  })
})

router.get('/class_history/(:barcode)', (req, res) => {
  barcode = req.params.barcode;
  const history_query = "select c.student_name, c.checked_in, c.is_swat, x.level, x.class_type, to_char(x.starts_at, 'Month DD, YYYY HH12:MI') as \"starts_at\" from class_signups c, classes x where c.barcode = $1 AND c.class_session_id = x.class_id order by x.starts_at;"
  db.any(history_query, [barcode])
    .then(rows => {
      res.render('class_history', {
        alert_message: '',
        class_data: rows
      })
    })
    .catch(err => {
      console.log("Issue with pulling class data with barcode " + barcode);
      console.log("Issue: " + err);
      res.render('class_history', {
        alert_message: "Ugh oh, something went wrong. It's probably an issue with pulling the class data from this profile. Error: " + err,
        class_data: ''
      })
    })
})

router.get('/test_lookup', (req, res) => {
  res.render('test_lookup', {

  })
})

router.post('/test_lookup', (req, res) => {
  const item = {
    month: req.sanitize('month_select').trim(),
    day: req.sanitize('day_select').trim()
  }
  const redir_link = 'test_selector_force/' + item.month + '/' + item.day;
  res.redirect(redir_link);
})

router.get('/test_selector_force/(:month)/(:day)', (req, res) => {
  const date_conversion = req.params.month + ' ' + req.params.day;
  const test_info = "select to_char(test_date, 'Month') as test_month, to_char(test_date, 'DD') as test_day, to_char(test_time, 'HH:MI PM') as testing_time, id, level from test_instance where to_char(test_date, 'Month DD') = to_char(to_date($1, 'Month DD'), 'Month DD');"
  db.any(test_info, [date_conversion])
    .then(rows => {
      res.render('test_selector', {
        data: rows
      })
    })
    .catch(err => {
      console.log('error in getting tests ' + err);
      res.redirect('home');
    })
})

router.get('/test_checkin/(:id)/(:level)', (req, res) => {
  const test_info = "select to_char(test_date, 'Month DD') as test_day, to_char(test_time, 'HH:MI PM') as testing_time, level from test_instance where id = $1;";
  const student_query = "select distinct session_id, student_name, barcode, belt_color, pass_status from test_signups where test_id = $1 and pass_status is null;";
  const pass_status = "select distinct session_id, student_name, barcode, belt_color, pass_status from test_signups where test_id = $1 and pass_status is not null;";
  const stud_names = "select * from get_names($1);";
  db.any(pass_status, [req.params.id])
    .then(pass_status => {
      db.any(student_query, [req.params.id])
      .then(stud_rows => {
        db.any(test_info, [req.params.id])
          .then(rows => {
            db.any(stud_names, [req.params.level])
            .then(name_data => {
              res.render('test_checkin', {
                test_info: rows,
                name_data: name_data,
                pass_status: pass_status,
                stud_info: stud_rows,
                test_id: req.params.id,
                level: req.params.level
              })
            })
            .catch(err => {
              console.log('Could not get names for search bar. ' + err);
              res.redirect('home');
            })
          })
          .catch(err => {
            console.log('Could not get test info with id ' + req.params.id);
            res.redirect('home');
          })
      })
      .catch(err => {
        console.log('Could not find tests with id ' + req.params.id);
        res.redirect('home');
      })
    })
    .catch(err => {
      console.log('Could not get pass_status: ' + err);
      res.redirect('home');
    })
})

router.post('/test_checkin', (req, res) => {
  const item = {
    test_id: req.sanitize('test_id').trim(),
    stud_data: req.sanitize('result').trim(),
    level: req.sanitize('level').trim()
  }
  console.log('item.stud_data: ' + item.stud_data);
  const stud_info = parseStudentInfo(item.stud_data);//name, barcode
  console.log('stud_info: ' + stud_info);
  const insert_query = "insert into test_signups (student_name, test_id, belt_color, email, barcode) values ($1, $2, (select x.belt_color from student_list x where x.barcode = $3), (select email from student_list where barcode = $4), $5) on conflict (session_id) do nothing;";
  db.any(insert_query, [stud_info[0], item.test_id, stud_info[1], stud_info[1], stud_info[1]])
    .then(rows => {
      res.redirect('test_checkin/' + item.test_id + '/' + item.level);
    })
    .catch(err => {
      res.redirect('home');
      console.log('Could not checkin to test. Error: ' + err);
    })
})

router.get('/test_remove/(:barcode)/(:test_id)', (req, res) => {
  const remove_query = "delete from test_signups where barcode = $1 and test_id = $2;";
  db.any(remove_query, [req.params.barcode, req.params.test_id])
    .then(rows => {
      res.redirect('https://ema-planner.herokuapp.com/test_checkin/' + req.params.test_id + '/' + req.params.barcode);
    })
    .catch(err => {
      console.log('Could not remove person from test: ' + req.params.test_id + ', ' + req.params.barcode);
      console.log('test_remove_error: ' + err);
      res.redirect('https://ema-planner.herokuapp.com/test_selector_force');
    });
})

router.get('/update_test_checkin/(:barcode)/(:session_id)/(:test_id)/(:level)', (req, res) => {
  const insert_query = "insert into student_tests (test_id, barcode) values ($1, $2) on conflict (session_id) do nothing;";
  const update_status = "update test_signups set checked_in = true where session_id = $1";
  db.any(insert_query, [req.params.test_id, req.params.barcode])
    .then(rows => {
      db.none(update_status, [req.params.session_id])
        .then(rows => {
          res.redirect('https://ema-planner.herokuapp.com/test_checkin/' + req.params.test_id + '/' + req.params.level);
        })
        .catch(err => {
          console.log('Could not update checked_in status of ' + req.params.session_id + ': ' + err);
          res.redirect('https://ema-planner.herokuapp.com/test_checkin/' + req.params.test_id + '/' + req.params.level);
        })
    })
    .catch(err => {
      console.log('Could not check in person with test_id, barcode ' + req.params.test_id + ', ' + req.params.barcode);
      res.redirect('https://ema-planner.herokuapp.com/test_selector_force');
    })
})

router.get('/pass_test/(:belt_color)/(:barcode)/(:test_id)/(:level)', (req, res) => {
  const update_status = "update test_signups set pass_status = true where barcode = $1 and test_id = $2;";//color, level, order
  const belt_info = parseBelt(req.params.belt_color, true);
  console.log('belt color was: ' + req.params.belt_color);
  console.log('belt color is ' + belt_info);
  const update_info = "update student_list set belt_color = $1, level_name = $2, belt_order = $3 where barcode = $4;";
  db.any(update_status, [req.params.barcode, req.params.test_id])
    .then(rows => {
      db.any(update_info, [belt_info[0], belt_info[1], belt_info[2], req.params.barcode])
        .then(rows => {
          res.redirect('https://ema-planner.herokuapp.com/test_checkin/' + req.params.test_id + '/' + req.params.level);
        })
        .catch(err => {
          console.log('Could not update belt info of student ' + req.params.barcode);
          console.log('Success error: ' + err);
          res.redirect('https://ema-planner.herokuapp.com/test_checkin/' + req.params.test_id + '/' + req.params.level);
        })
    })
    .catch(err => {
      console.log('Could not update test status of student ' + req.params.barcode);
      console.log('Could not update test status. Error: ' + err);
      res.redirect('home');
    })
})

router.get('/fail_test/(:barcode)/(:test_id)/(:level)', (req, res) => {
  const update_status = "update test_signups set pass_status = false where barcode = $1 and test_id = $2;";
  db.any(update_status, [req.params.barcode, req.params.test_id])
    .then(rows => {
      res.redirect('https://ema-planner.herokuapp.com/test_checkin/' + req.params.test_id + '/' + req.params.level);
    })
    .catch(err => {
      console.log("Could not update test status of student " + req.params.barcode);
      res.redirect('home');
    })
})

router.post('/class_lookup', (req, res) => {
  const item = {
    month: req.sanitize('month_select').trim(),
    day: req.sanitize('day_select').trim()
  }
  const redir_link = 'class_selector_force/' + item.month + '/' + item.day
  res.redirect(redir_link)
})

router.get('/student_lookup', (req, res) => {
  const name_query = "select * from get_all_names()"
  db.any(name_query)
    .then(function (rows) {
      res.render('student_lookup', {
        data: rows,
        alert_message: ''
      })
    })
    .catch(function (err) {
      console.log('Could not find students: ' + err)
      res.render('student_lookup', {
        data: '',
        alert_message: 'Unable to find student. Please refresh the page and try agin.'
      })
    })
})

router.get('/student_data', (req, res) => {
  res.render('student_data', {
    data: '',
    name: '',
    barcode: ''
  })
})

function parseStudentInfo(info){
  var stud_info = ['', 0];
  stud_info[0] = info.substring(0, info.indexOf(' - '));
  stud_info[1] = info.substring(info.indexOf(' - ') + 3, info.length);
  return stud_info;
}

router.post('/student_lookup', (req, res) => {
  var items = {
    student_info: req.sanitize('result').trim()
  }
  const stud_info = parseStudentInfo(items.student_info);
  const studentInfoQuery = "select barcode, first_name, last_name, email, belt_size, belt_color, to_char(last_visit, 'Month DD, YYYY') as last_visit, reg_class, spar_class from student_list where barcode = $1 and first_name || ' ' || last_name = $2;";
  console.log('items.student_info is ' + items.student_info);
  console.log('stud_info: ' + stud_info);
  db.any(studentInfoQuery, [stud_info[1], stud_info[0]])
    .then(rows => {
      console.log('In .then for /student_lookup')
      res.render('student_data', {
        data: rows,
        name: stud_info[0],
        barcode: stud_info[1]
      })
    })
    .catch(err => {
      res.render('student_lookup', {
        data: '',
        alert_message: "Error: Could not retrieve student info for " + items.student_info + ". Please refresh the page and try again. Error: " + err
      })
    })
})

router.post('/count_update', (req, res) => {
  var items = {
    barcode: req.sanitize('barcode').trim(),
    reg_class: req.sanitize('reg_class').trim(),
    spar_class: req.sanitize('spar_class').trim()
  }
  const count_update = 'update student_list set reg_class = $1, spar_class = $2 where barcode = $3';
  db.any(count_update, [items.reg_class, items.spar_class, items.barcode])
    .then(rows => {
      const name_query = "select * from get_all_names()"
      db.any(name_query)
        .then(names => {
          res.render('student_lookup', {
            data: names,
            alert_message: "Student has been updated with \nregular classes = " + items.reg_class + "\nsparring classes = " + items.spar_class
          })
        })
        .catch(err => {
          console.log('Could not find students: ' + err)
          res.render('student_lookup', {
            data: '',
            alert_message: 'Could not find any students. Please refresh the page and try again.'
          })
        })
    })
    .catch(err => {
      console.log('Could not update student counts');
      res.render('student_lookup', {
        data: '',
        alert_message: 'Could not update the counts. Please refresh page and try again.'
      })
    })
})

router.post('/student_data', (req, res) => {
  var items = {
    barcode: req.sanitize('barcode').trim(),
    first_name: req.sanitize('first_name').trim(),
    last_name:  req.sanitize('last_name').trim(),
    email: req.sanitize('email').trim(),
    belt_size: req.sanitize('beltSize').trim(),
    belt_color: req.sanitize('beltColor').trim()
  }
  var level_info = parseBelt(items.belt_color, false);
  console.log('level_info: ' + level_info);
  const update_query = "update student_list set first_name = $1, last_name = $2, belt_color = $3, belt_size = $4, email = $5, level_name = $6, belt_order = $7 where barcode = $8;";
  db.none(update_query, [items.first_name, items.last_name, level_info[0], items.belt_size, items.email, level_info[1], level_info[2], items.barcode])
    .then(rows_update => {
      const name_query = "select * from get_all_names()"
      db.any(name_query)
        .then(function (rows) {
          res.render('student_lookup', {
            data: rows,
            alert_message: items.first_name + ' ' + items.last_name + ' has been successfully updated!'
          })
        })
        .catch(function (err) {
          console.log('Could not find students: ' + err)
          res.render('student_lookup', {
            data: '',
            alert_message: 'Could not find any students. Please refresh the page and try again.'
          })
        })
    })
    .catch(err => {
      console.log('Could not update student: ' + err)
      res.render('student_lookup', {
        data: '',
        alert_message: 'Could not update the student ' + items.first_name + ' ' + items.last_name + '. Please make a note of this and contact the admin.'
      })
    })
})

router.get('/create_test', (req, res) => {
  res.render('create_test', {
    alert_message: ''
  })
})

router.post('/create_test', (req, res) => {
  const item = {
    level: req.sanitize('level_select').trim(),
    month: req.sanitize('month_select').trim(),
    day: req.sanitize('day_select').trim(),
    time: req.sanitize('time_select').trim()
  }
  let temp_date = new Date();
  let year = temp_date.getFullYear();
  const built_date = item.month + ' ' + item.day + ', ' + year;
  console.log('item.level: ' + item.level);
  console.log('built_date: ' + built_date);
  console.log('item.time: ' + item.time);
  const new_test_query = "insert into test_instance (level, test_date, test_time) values (($1)::int, to_date($2, 'Month DD, YYYY'), ($3)::time)";
  db.any(new_test_query, [item.level, built_date, item.time])
    .then(function (rows) {
      switch (item.level) {
        case '-1':
          res.render('create_test', {
            alert_message: 'Test created for Little Dragons on ' + built_date + ' at ' + item.time
          })
          break;
        case '0':
          res.render('create_test', {
            alert_message: 'Test created for Basic on ' + built_date + ' at ' + item.time
          })
          break;
        case '1':
          res.render('create_test', {
            alert_message: 'Test created for Level 1 on ' + built_date + ' at ' + item.time
          })
          break;
        case '2':
          res.render('create_test', {
            alert_message: 'Test created for Level 2 on ' + built_date + ' at ' + item.time
          })
          break;
        case '3':
          res.render('create_test', {
            alert_message: 'Test created for Level 3 on ' + built_date + ' at ' + item.time
          })
          break;
        case '7':
          res.render('create_test', {
            alert_message: 'Test created for Exclusive on ' + built_date + ' at ' + item.time
          })
          break;
        default:
          req.flash('error', 'Test Not Created! with data: (level: ' + item.level + ', built_date: ' + built_date + ', time: ' + item.time + ')');
          console.log('Test Not Created! with data: (level: ' + item.level + ', built_date: ' + built_date + ', time: ' + item.time + ')');
          res.redirect('/create_test');
          break;
      }
    })
    .catch(function (err) {
      console.log("Error in creating test: " + err);
      req.flash('error', 'Test not created. ERR: ' + err);
      res.render('create_test', {
        alert_message: 'Test not created. Error: ' + err
      })
    })
})

router.get('/email_lookup', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/email_lookup');
  } else {
    res.render('email_lookup', {
      email: '',
      alert_message: ''
    })
  }
})

router.get('/student_portal_login', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/student_portal_login');
  } else {
    const portal_query = "select * from get_all_names()"
    db.any(portal_query)
    .then(function (rows) {
      res.render('student_portal_login', {
        data: rows,
        alert_message: ''
      })
    })
    .catch(function (err) {
      console.log('Could not find students: ' + err)
      res.render('student_portal_login', {
        data: '',
        alert_message: 'Unable to find student. Please refresh the page and try agin.'
      })
    })
  }
})

router.post('/email_lookup', (req, res) => {
  const item = {
    email: req.sanitize('email')
  }
  const email = String(item.email).toLowerCase();
  res.redirect('classes_email/' + email);
})

router.post('/student_portal_login', (req, res) => {
  const item = {
    student_info: req.sanitize('result').trim()
  }
  const stud_info = parseStudentInfo(item.student_info); //name, barcode
  res.redirect('student_portal/' + stud_info[1]);
})

router.get('/student_portal/(:barcode)', (req, res) => {
  const stud_info = "select first_name, last_name, email, belt_order, belt_color, belt_size, to_char(last_visit, 'Month DD, YYYY') as last_visit, reg_class, spar_class from student_list where barcode = $1;";
  const test_query = "select s.student_name, s.session_id, s.test_id, s.email, to_char(i.test_date, 'Month') || ' ' || to_char(i.test_date, 'DD') || ' at ' || to_char(i.test_time, 'HH:MI PM') as test_instance from test_signups s, test_instance i where s.barcode = $1 and i.id = s.test_id order by i.test_date;";
  const class_query = "select s.student_name, s.email, s.class_check, s.class_session_id, s.is_swat, to_char(c.starts_at, 'Month') || ' ' || to_char(c.starts_at, 'DD') || ' at ' || to_char(c.starts_at, 'HH:MI PM') as class_instance, c.starts_at, c.class_id from classes c, class_signups s where s.barcode = $1 and s.class_session_id = c.class_id and s.is_swat = false and c.starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date order by s.student_name, c.starts_at;";
  const swat_query = "select s.student_name, s.email, s.class_check, s.is_swat, s.class_session_id, to_char(c.starts_at, 'Month') || ' ' || to_char(c.starts_at, 'DD') || ' at ' || to_char(c.starts_at, 'HH:MI PM') as class_instance, c.starts_at, c.class_id from classes c, class_signups s where s.barcode = $1 and s.class_session_id = c.class_id and c.starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and s.is_swat = true order by c.starts_at;";
  db.any(stud_info, [req.params.barcode])
    .then(info => {
      db.any(class_query, [req.params.barcode])
        .then(classes => {
          db.any(test_query, [req.params.barcode])
            .then(tests => {
              db.any(swat_query, [req.params.barcode])
                .then(swats => {
                  res.render('student_portal', {
                    stud_info: info,
                    class_info: classes,
                    test_info: tests,
                    swat_info: swats,
                    barcode: req.params.barcode,
                    alert_message: ''
                  })
                })
                .catch(err => {
                  console.log('Could not get student swats with barcode. Error: ' + err);
                  res.render('student_portal', {
                    stud_info: '',
                    class_info: '',
                    test_info: '',
                    swat_info: '',
                    barcode: req.params.barcode,
                    alert_message: "Could not find student swats with the barcode: " + req.params.barcode + "\n Please see an instructor to correct this."
                  })
                })
            })
            .catch(err => {
              console.log('Could not get student tests with barcode. Error: ' + err);
              res.render('student_portal', {
                stud_info: '',
                class_info: '',
                test_info: '',
                swat_info: '',
                barcode: req.params.barcode,
                alert_message: "Could not find student tests with the barcode: " + req.params.barcode + "\n Please see an instructor to correct this."
              })
            })
        })
        .catch(err => {
          console.log('Could not get student classes with barcode. Error: ' + err);
          res.render('student_portal', {
            stud_info: '',
            class_info: '',
            test_info: '',
            swat_info: '',
            barcode: req.params.barcode,
            alert_message: "Could not find student classes with the email: " + req.params.barcode + "\n Please see an instructor to correct this."
      })
        })
    })
    .catch(err => {
      console.log('Could not get student info with barcode. Error: ' + err);
      res.render('student_portal', {
        stud_info: '',
        class_info: '',
        test_info: '',
        swat_info: '',
        barcode: req.params.barcode,
        alert_message: "Could not find a student with the barcode: " + req.params.barcode + "\n Please see an instructor to correct this."
      })
    })
})

router.get('/request_fix', (req, res) => {
  res.render('request_fix', {
    alert_message: ''
  })
})

router.post('/request_fix', (req, res) => {
  var item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    change_data:  req.sanitize('paragraph_text')
  }
  var transporter = nodemailer.createTransport({
    service: 'outlook',
    auth: {
        user: 'EMA_Classes@outlook.com',
        pass: process.env.EMAIL
    }
  });
  var mailOptions = {
      from: 'EMA_Classes@outlook.com',
      to: 'EMA_Testing@outlook.com',
      subject: 'Student Data Change Request - ' + String(item.student_name),
      text: String(item.change_data)
  };
  transporter.sendMail(mailOptions, function(error, info){
      if (error){
          console.log(error);
          res.render('request_fix', {
            email: req.params.email,
            alert_message: 'Email was not sent. Please see staff member.'
          })
      } else {
          console.log('Email sent: ' + info.response);
          res.render('student_portal_login', {
            email: item.email,
            alert_message: 'Email sent successfully. You should see an update soon!'
          })
      }
  });
})

router.get('/classes_email/(:email)', (req, res) => {
  const test_query = "select s.student_name, s.session_id, s.test_id, s.email, to_char(i.test_date, 'Month') || ' ' || to_char(i.test_date, 'DD') || ' at ' || to_char(i.test_time, 'HH:MI PM') as test_instance from test_signups s, test_instance i where s.email = $1 and i.id = s.test_id order by i.test_date;";
  const class_query = "select s.student_name, s.email, s.class_check, s.class_session_id, s.is_swat, to_char(c.starts_at, 'Month') || ' ' || to_char(c.starts_at, 'DD') || ' at ' || to_char(c.starts_at, 'HH:MI PM') as class_instance, c.starts_at, c.class_id from classes c, class_signups s where s.email = $1 and s.class_session_id = c.class_id and s.is_swat = false and c.starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date order by c.starts_at;";
  const swat_query = "select s.student_name, s.email, s.class_check, s.is_swat, s.class_session_id, to_char(c.starts_at, 'Month') || ' ' || to_char(c.starts_at, 'DD') || ' at ' || to_char(c.starts_at, 'HH:MI PM') as class_instance, c.starts_at, c.class_id from classes c, class_signups s where s.email = $1 and s.class_session_id = c.class_id and c.starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and s.is_swat = true order by c.starts_at;";
  db.any(class_query, [req.params.email])
    .then(classes => {
      db.any(test_query, [req.params.email])
        .then(tests => {
          db.any(swat_query, [req.params.email])
            .then(swats => {
              res.render('classes_email', {
                email: req.params.email,
                class_data: classes,
                test_data: tests,
                swat_data: swats,
                alert_message: ''
              })
            })
            .catch(err => {
              console.log('Error pulling in swats. Err: ' + err);
              res.render('classes_email', {
                email: req.params.email,
                class_data: '',
                test_data: '',
                swat_data: '',
                alert_message: 'Error pulling in swats. Please see staff member.'
              })
            })
        })
        .catch(err => {
          console.log('Error pulling in tests. Err: ' + err);
          res.render('classes_email', {
            email: req.params.email,
            class_data: '',
            test_data: '',
            swat_data: '',
            alert_message: 'Error pulling in tests. Please see staff member.'
          })
        })
    })
    .catch(err => {
      console.log('Error pulling in classes. Err: ' + err);
      res.render('classes_email', {
        email: req.params.email,
        class_data: '',
        test_data: '',
        swat_data: '',
        alert_message: 'Error pulling in classes. Please see staff member.'
      })
    })
})

app.get('/delete_instance/(:barcode)/(:item_id)/(:id)/(:email)/(:type)', (req, res) => {
  switch (req.params.type) { //allows for addition of swat class
    case 'test':
      const drop_test = "delete from test_signups where session_id = $1 and email = $2;";
      db.none(drop_test, [req.params.id, req.params.email])
        .then(rows => {
          res.redirect('https://ema-planner.herokuapp.com/student_portal/' + req.params.barcode);
        })
        .catch(err => {
          console.log('Unable to delete test. ERR: ' + err);
          res.render('classes_email', {
            email: req.params.email,
            class_data: '',
            test_data: '',
            alert_message: 'Unable to delete test. Please refresh and try again. Otherwise, please see a staff member.'
          })
        })
      break;
    case 'class':
      const dropt_class = "delete from class_signups where class_check = $1 and email = $2;";
      db.none(dropt_class, [req.params.id, req.params.email])
        .then(rows => {
          res.redirect('https://ema-planner.herokuapp.com/student_portal/' + req.params.barcode);
        })
        .catch(err => {
          console.log('Unable to delete class. ERR: ' + err);
          res.render('classes_email', {
            email: req.params.email,
            class_data: '',
            test_data: '',
            alert_message: 'Unable to delete class. Please refresh and try again. Otherwise, please see a staff member.'
          })
        })
      break;
    case 'swat':
      const drop_class = "delete from class_signups where class_check = $1 and email = $2;";
      const update_count = "update classes set swat_count = swat_count - 1 where class_id = $1;"
      db.none(update_count, [req.params.item_id])
        .then(row => {
          db.none(drop_class, [req.params.id, req.params.email])
            .then(rows => {
              res.redirect('https://ema-planner.herokuapp.com/student_portal/' + req.params.barcode);
            })
            .catch(err => {
              console.log('Unable to delete swat. ERR: ' + err);
              res.render('classes_email', {
                email: req.params.email,
                class_data: '',
                test_data: '',
                alert_message: 'Unable to delete swat. Please refresh and try again. Otherwise, please see a staff member.'
              })
            })
        })
        .catch(err => {
          console.log('Unable to update swat count. ERR: ' + err);
          res.render('classes_email', {
            email: req.params.email,
            class_data: '',
            test_data: '',
            alert_message: 'Unable to delete swat count. Please refresh and try again. Otherwise, please see a staff member.'
          })
        })
      break;
    default:
      console.log('Unknown delete type.');
      res.redirect('https://ema-planner.herokuapp.com/student_portal/' + req.params.barcode);
      break;
  }
})

//TESTING SIGNUP SECTION
function parse_name(name) {
  const seperator = name.indexOf('/');
  const values = [];
  values.push(name.substring(0, seperator));
  values.push(Number(name.substring(seperator + 1, name.length)));
  return values;
}

router.get('/student_tests', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/student_tests');
  } else {
    res.render('student_tests', {
    })
  }
})

router.get('/testing_signup_dragons', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_dragons');
  } else {
    const name_query = "select * from get_names(-1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = -1 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_dragons', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_dragons');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_dragons');
      })
  }
})

router.get('/testing_signup_basic', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_basic');
  } else {
    const name_query = "select * from get_names(0);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 0 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_basic', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_basic');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_basic');
      })
  }
})

router.get('/testing_signup_level1', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_level1');
  } else {
    const name_query = "select * from get_names(1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 1 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_level1', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_level1');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_level1');
      })
  }
})

router.get('/testing_signup_level2', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_level2');
  } else {
    const name_query = "select * from get_names(2);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 2 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_level2', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_level2');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_level2');
      })
  }
})

router.get('/testing_signup_level3', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_level3');
  } else {
    const name_query = "select * from get_names(1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 3 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_level3', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_level3');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_level3');
      })
  }
})

router.get('/testing_signup_weapons', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/testing_signup_weapons');
  } else {
    const name_query = "select * from get_names(1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = 7 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    db.any(name_query)
      .then(rows_names => {
        db.any(tests)
          .then(rows => {
            res.render('testing_signup_weapons', {
              names: rows_names,
              email: '',
              belts: '',
              tests: rows
            })
          })
          .catch(err => {
            console.log('Could not get tests. Error: ' + err);
            res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
            res.redirect('/testing_signup_weapons');
          })
      })
      .catch(err => {
        console.log('Could not get names. Error: ' + err);
        req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
        res.redirect('/testing_signup_weapons');
      })
  }
})

router.post('/testing_signup_dragons', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_dragons');
    })
})

router.post('/testing_signup_basic', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_basic');
    })
})

router.post('/testing_signup_level1', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_level1');
    })
})

router.post('/testing_signup_level2', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_level2');
    })
})

router.post('/testing_signup_level3', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_level3');
    })
})

router.post('/testing_signup_weapons', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belts').trim(),
    test_id: req.sanitize('test_selection').trim()
  };
  console.log('item.test_id: ' + item.test_id);
  const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
  const data = parse_name(item.student_name);
  db.any(test_instance, [item.test_id])
    .then(rows => {
      res.render('testing_preview', {
        test_info: rows,
        barcode: data[1],
        test_id: item.test_id,
        student_name: data[0],
        email: item.email,
        belt_color: item.belt_color
      })
    })
    .catch(err => {
      console.log('Could not find test with given id. ERROR: ' + err);
      req.flash('error', 'Unable to verify the test you are signed up for.');
      res.redirect('/testing_signup_weapons');
    })
})

router.get('/testing_preview', (req, res) => {
  res.render('testing_preview', {
    test_info: '',
    test_id: '',
    student_name: '',
    barcode: '',
    email: '',
    belt_color: ''
  })
})

function belt_parser(color) {
  const regex_dragon = /Dragons/g;
  const regex_basic = /^White|^Gold/g;
  const regex_level1 = /^Orange|^High Orange|^Green|^High Green/g;
  const regex_level2 = /^Purple|^High Purple|^Blue|^High Blue/g;
  const regex_level3 = /^Red|^High Red|^Brown|^High Brown/g;
  const regex_weapons = /^Weapons/g;
  if (regex_dragon.test(color)) {
    return 'Dragons';
  } else if (regex_basic.test(color)) {
    return 'Basic';
  } else if (regex_level1.test(color)) {
    return 'Level 1';
  } else if (regex_level2.test(color)) {
    return 'Level 2';
  } else if (regex_level3.test(color)) {
    return 'Level 3';
  } else if (regex_weapons.test(color)) {
    return 'Weapons';
  } else {
    return 'Unknown';
  }
}

router.post('/test_preview', (req, res) => {
  const item = {
    student_name: req.sanitize('student_name').trim(),
    email: req.sanitize('email').trim(),
    belt_color: req.sanitize('belt_color').trim(),
    test_id: req.sanitize('test_id').trim(),
    barcode: req.sanitize('barcode').trim(),
    button: req.sanitize('button')
  };
  if (item.button == 'Submit') {
    const test_instance = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance from test_instance where id = $1;";
    db.any(test_instance, [item.test_id])
      .then(rows => {
        if (item.email == 'exclusivemartialarts@gmail.com') {
          res.render('testing_confirmed', {
            student_name: 'Master Young',
            email: 'master_young@ninja.com',
            belt_color: item.belt_color,
            test_instance: rows
          })
        } else {
          const insert_query = "insert into test_signups (student_name, test_id, belt_color, email, barcode) values ($1, $2, $3, $4, $5) on conflict(session_id) do nothing;";
          const add_belt = "update belt_inventory set quantity = quantity + 1 where color = (select belt_color from student_list where barcode = $1) and size = (select belt_size from student_list where barcode = $2)::text;"
          db.any(insert_query, [item.student_name, item.test_id, item.belt_color, item.email, item.barcode])
            .then(rows => {
              db.any(add_belt, [item.barcode, item.barcode])
                .then(row => {
                  res.render('testing_confirmed', {
                    student_name: item.student_name,
                    email: item.email,
                    belt_color: item.belt_color,
                    test_instance: rows,
                    alert_message: 'You have successfully signed up for testing!'
                  })
                })
                .catch(err => {
                  console.log('Could not add belt. Err: ' + err);
                  res.redirect('/student_tests');
                })
            })
            .catch(err => {
              console.log('Could not add to test_signups. ERROR: ' + err);
              req.flash('error', 'Could not sign up for test.');
              res.redirect('/student_tests');
            })
        }
      })
      .catch(err => {
        console.log('Could not confirm test. ERROR: ' + err);
        req.flash('error', 'Cound not complete signup. Please see staff member.');
        res.redirect('/student_tests');
      })
  } else {
    const name_query = "select * from get_names($1);";
    const tests = "select TO_CHAR(test_date, 'Month') || ' ' || extract(DAY from test_date) || ' at ' || to_char(test_time, 'HH12:MI PM') as test_instance, id from test_instance where level = $1 and test_date >= (CURRENT_DATE - INTERVAL '7 hour')::date;";
    switch (belt_parser(item.belt_color)) {
      case 'Dragons':
        db.any(name_query, [-1])
          .then(rows_names => {
            db.any(tests, [-1])
              .then(rows => {
                res.render('testing_signup_dragons', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_dragons');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_dragons');
          })
        break;
      case 'Basic':
        db.any(name_query, [0])
          .then(rows_names => {
            db.any(tests, [0])
              .then(rows => {
                res.render('testing_signup_basic', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_basic');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_basic');
          })
        break;
      case 'Level 1':
        db.any(name_query, [1])
          .then(rows_names => {
            db.any(tests, [1])
              .then(rows => {
                res.render('testing_signup_level1', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_level1');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_level1');
          })
        break;
      case 'Level 2':
        db.any(name_query, [2])
          .then(rows_names => {
            db.any(tests, [2])
              .then(rows => {
                res.render('testing_signup_level2', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_level2');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_level2');
          })
        break;
      case 'Level 3':
        db.any(name_query, [3])
          .then(rows_names => {
            db.any(tests, [3])
              .then(rows => {
                res.render('testing_signup_level3', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_level3');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_level3');
          })
        break;
      case 'Weapons':
        db.any(name_query, [7])
          .then(rows_names => {
            db.any(tests, [7])
              .then(rows => {
                res.render('testing_signup_weapons', {
                  names: rows_names,
                  email: item.email,
                  belts: item.belt_color,
                  tests: rows
                })
              })
              .catch(err => {
                console.log('Could not get tests. Error: ' + err);
                res.send(req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.'));
                res.redirect('/testing_signup_weapons');
              })
          })
          .catch(err => {
            console.log('Could not get names. Error: ' + err);
            req.flash('error', 'Signup UNSUCCESSFUL. Please see a staff member.');
            res.redirect('/testing_signup_weapons');
          })
        break;
      default:
        console.log('Unknown level for Edit');
        break;
    }
  }
})

router.get('/refresh_belts', (req, res) => {
  const belt_query = "update belt_inventory set quantity = 0;"
  db.none(belt_query)
    .then(row => {
      res.redirect('https://ema-planner.herokuapp.com/belt_inventory');
    })
    .catch(err => {
      console.log('Could not refresh belts');
      res.redirect('https://ema-planner.herokuapp.com/belt_inventory');
    })
})
//END TEST SIGNUP SECTION

function convertTZ(date, tzString) {
  return new Date((typeof date === "string" ? new Date(date) : date).toLocaleString("en-US", {timeZone: tzString}));   
}
var getMonth = convertTZ(new Date(), "America/Denver").getMonth() + 2;
var getYear = convertTZ(new Date(), "America/Denver").getFullYear();
if (getMonth > 12){
  getYear = getYear + 1;
  getMonth = getMonth - 12;
}

router.get('/dragons_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/dragons_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level from classes where level = -1 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(-1);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, date_calculation)
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: 'dragons'
              })
            } else {
              res.render('dragons_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render Little Dragons classes. ERROR: ' + err);
            res.render('dragons_signup', {
              alert_message: 'Could not find Little Dragons classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render Little Dragons names. ERROR: ' + err);
        res.render('dragons_signup', {
          alert_message: 'Could not find dragons names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.get('/basic_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/basic_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level from classes where level in (0, 0.5) and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(0);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, [date_calculation])
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: 'basic'
              })
            } else {
              res.render('basic_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render black belt classes. ERROR: ' + err);
            res.render('basic_signup', {
              alert_message: 'Could not find basic classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render basic names. ERROR: ' + err);
        res.render('basic_signup', {
          alert_message: 'Could not find basic names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.get('/level1_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/level1_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level from classes where level in (1, 1.5) and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(1);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, [date_calculation])
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: 'level 1'
              })
            } else {
              res.render('level1_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render level 1 classes. ERROR: ' + err);
            res.render('level1_signup', {
              alert_message: 'Could not find level 1 classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render level 1 names. ERROR: ' + err);
        res.render('level1_signup', {
          alert_message: 'Could not find level 1 names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.get('/level2_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/level2_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level from classes where level = 2 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(2);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, [date_calculation])
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: 'level 2'
              })
            } else {
              res.render('level2_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render level 2 classes. ERROR: ' + err);
            res.render('level2_signup', {
              alert_message: 'Could not find level 2 classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render level 2 names. ERROR: ' + err);
        res.render('level2_signup', {
          alert_message: 'Could not find level 2 names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.get('/level3_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/level3_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level from classes where level = 3 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(3);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, [date_calculation])
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: 'level 3'
              })
            } else {
              res.render('level3_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render level 3 classes. ERROR: ' + err);
            res.render('level3_signup', {
              alert_message: 'Could not find level 3 classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render level 3 names. ERROR: ' + err);
        res.render('level3_signup', {
          alert_message: 'Could not find level 3 names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.get('/wfc_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/wfc_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level from classes where level = 8 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(0);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, [date_calculation])
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: "Women's Fight Club"
              })
            } else {
              res.render('wfc_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render womens fight club classes. ERROR: ' + err);
            res.render('wfc_signup', {
              alert_message: 'Could not find womens fight club classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render names. ERROR: ' + err);
        res.render('wfc_signup', {
          alert_message: 'Could not find names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.get('/bb_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/bb_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level from classes where level = 5 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(5);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, [date_calculation])
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: 'black belt'
              })
            } else {
              res.render('bb_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render black belt classes. ERROR: ' + err);
            res.render('bb_signup', {
              alert_message: 'Could not find black belt classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render black belt names. ERROR: ' + err);
        res.render('bb_signup', {
          alert_message: 'Could not find black belt names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.get('/swat_signup', (req, res) => {
  var date_calculation = String(convertTZ(new Date(), "America/Denver").getMonth() + 2) + " 07, " + String(convertTZ(new Date(), "America/Denver").getFullYear());
  if (req.headers['x-forwarded-proto'] != 'https') {
    res.redirect('https://ema-planner.herokuapp.com/swat_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, level, swat_count from classes where level in (7, 0.5, 2, 3, 1.5, 0, 1, -1) and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date and swat_count < 3 and can_view = TRUE and starts_at < (to_date($1, 'MM DD, YYYY')) and can_view = TRUE order by starts_at;";
    const get_names = "select * from signup_names(5);";
    db.any(get_names)
      .then(names => {
        db.any(class_query, [date_calculation])
          .then(rows => {
            if (rows.length == 0) {
              res.render('temp_classes', {
                level: 'swat'
              })
            } else {
              res.render('swat_signup', {
                alert_message: '',
                fname: '',
                lname: '',
                level: '',
                email: '',
                classes: rows,
                names: names
              })
            }
          })
          .catch(err => {
            console.log('Could not render swat classes. ERROR: ' + err);
            res.render('swat_signup', {
              alert_message: 'Could not find swat classes.',
              fname: '',
              lname: '',
              level: '',
              email: '',
              classes: 'Unable to show classes.',
              names: ''
            })
          })
      })
      .catch(err => {
        console.log('Could not render swat names. ERROR: ' + err);
        res.render('swat_signup', {
          alert_message: 'Could not find swat names to display.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.',
          names: ''
        })
      })
  }
})

router.post('/dragons_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  belt_group = 'Little Dragons';
  const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/not_swat';
  res.redirect(redir_link);
})

router.post('/basic_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  belt_group = 'Basic';
  const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/not_swat';
  res.redirect(redir_link);
})

router.post('/level1_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  belt_group = 'Level 1';
  const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/not_swat';
  res.redirect(redir_link);
})

router.post('/level2_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  belt_group = 'Level 2';
  const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/not_swat';
  res.redirect(redir_link);
})

router.post('/level3_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  belt_group = 'Level 3';
  const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/not_swat';
  res.redirect(redir_link);
})

router.post('/bb_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  belt_group = 'Black Belt';
  console.log('1: ' + item.stud_data);
  console.log('2: ' + item.stud_data2);
  console.log('3: ' + item.stud_data3);
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  //const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/not_swat';
  res.redirect(redir_link);
})

router.post('/wfc_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  belt_group = 'Womans Fight Club';
  console.log('1: ' + item.stud_data);
  console.log('2: ' + item.stud_data2);
  console.log('3: ' + item.stud_data3);
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  //const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/not_swat';
  res.redirect(redir_link);
})

router.post('/swat_signup', (req, res) => {
  const item = {
    stud_data: req.sanitize('result').trim(),
    stud_data2: req.sanitize('result2').trim(),
    stud_data3: req.sanitize('result3').trim(),
    stud_data4: req.sanitize('result4').trim(),
    day_time: req.sanitize('day_time')
  }
  if (item.stud_data == ''){
    item.stud_data = ' ';
  }
  if (item.stud_data2 == ''){
    item.stud_data2 = ' ';
  }
  if (item.stud_data3 == ''){
    item.stud_data3 = ' ';
  }
  if (item.stud_data4 == ''){
    item.stud_data4 = ' ';
  }
  belt_group = 'Swat';
  const stud_info = parseStudentInfo(item.stud_data);
  const redir_link = 'process_classes/' + item.stud_data + '/' + item.stud_data2 + '/' + item.stud_data3 + '/' + item.stud_data4 + '/' + belt_group + '/' + item.day_time + '/is_swat';
  res.redirect(redir_link);
})

function parseID(id_set) {
  var set_id = [];
  while (id_set.indexOf(",") != -1) {
    var id_idx = id_set.indexOf(",");
    var id = id_set.substring(0, id_idx);
    id_set = id_set.substring(id_idx + 1, id_set.length);
    set_id.push(Number(id));
  }
  if ((id_set.indexOf(",") == -1) && (id_set !== '')) {
    set_id.push(Number(id_set));
    id_set = '';
  }
  return set_id;
}

router.get('/process_classes/(:stud_info)/(:stud_info2)/(:stud_info3)/(:stud_info4)/(:belt_group)/(:id_set)/(:swat)', (req, res) => {
  if (req.params.swat == 'is_swat'){
    var student_info = []
    if (req.params.stud_info != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info));
    }
    if (req.params.stud_info2 != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info2));
    }
    if (req.params.stud_info3 != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info3));
    }
    if (req.params.stud_info4 != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info4));
    }
    const query_classes = "insert into class_signups (student_name, email, class_session_id, class_check, barcode, is_swat) values ($1, (select lower(email) from student_list where barcode = $2), $3, $4, $5, true) on conflict (class_check) do nothing;";
    const email_info = "select email from student_list where barcode = $1;"
    var id_set = parseID(req.params.id_set);
    const swat_count = "update classes set swat_count = swat_count + 1 where class_id = $1;";
    /*
    id_set.forEach(element => {
      var temp_class_check = req.params.student_name.toLowerCase().split(" ").join("") + element.toString();
      db.none(swat_count, [element])
        .then(row => {
          db.none(query_classes, [req.params.student_name, req.params.barcode, element, temp_class_check, req.params.barcode])
            .then(rows => {
              console.log('Added swat class with element ' + element);
            })
            .catch(err => {
              console.log('Err: with swat element ' + element + '. Err: ' + err);
            })
        })
        .catch(err => {
          console.log('Could not update swat_count');
        })
    });
    */
    student_info.forEach(student => {
      id_set.forEach(element => {
        var temp_class_check = student[0].toLowerCase().split(" ").join("") + element.toString();
        db.none(swat_count, [element])
          .then(row => {
            db.none(query_classes, [student[0], student[1], element, temp_class_check, student[1]])
              .then(rows => {
                console.log('Added swat class with element ' + element);
              })
              .catch(err => {
                console.log('Err: with swat element ' + element + '. Err: ' + err);
                console.log('Err: with student ' + student + '. Err: ' + err);
              })
          })
          .catch(err => {
            console.log('Could not update swat_count');
          })
      })
    })
    var name_list = '';
    switch (student_info.length) {
      case 1:
        name_list = student_info[0][0];
        break;
      case 2:
        name_list = student_info[0][0] + ', ' + student_info[1][0];
        break;
      case 3:
        name_list = student_info[0][0] + ', ' + student_info[1][0] + ', ' + student_info[2][0];
        break;
      case 3:
        name_list = student_info[0][0] + ', ' + student_info[1][0] + ', ' + student_info[2][0] + ', ' + student_info[3][0];
        break;
      default:
        name_list = 'Error finding names'
        break;
    }
    switch (id_set.length) {
      case 1:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id = $1;"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'swat',
                  num_events: 1
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      case 2:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id in ($1, $2);"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0], id_set[1]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'swat',
                  num_events: 2
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      case 3:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id in ($1, $2, $3);"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0], id_set[1], id_set[2]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'swat',
                  num_events: 3
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      case 4:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id in ($1, $2, $3, $4);"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0], id_set[1], id_set[2], id_set[3]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'swat',
                  num_events: 4
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      default:
        console.log('Length of id_set not within [1,4]. id_set is ' + id_set + ' with length of ' + id_set.length);
        res.render('temp_classes', {
          alert_message: 'Class IDs not properly set. Classes NOT signed up for.',
          level: 'none'
        })
        break;
    };
  } else {
    var student_info = []
    if (req.params.stud_info != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info));
    }
    if (req.params.stud_info2 != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info2));
    }
    if (req.params.stud_info3 != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info3));
    }
    if (req.params.stud_info4 != ' '){
      student_info.push(parseStudentInfo(req.params.stud_info4));
    }
    const query_classes = "insert into class_signups (student_name, email, class_session_id, class_check, barcode) values ($1, (select lower(email) from student_list where barcode = $2), $3, $4, $5) on conflict (class_check) do nothing;";
    const email_info = "select email from student_list where barcode = $1;"
    var id_set = parseID(req.params.id_set);
    /*
    id_set.forEach(element => {
      var temp_class_check = req.params.student_name.toLowerCase().split(" ").join("") + element.toString();
      db.none(query_classes, [req.params.student_name, req.params.barcode, element, temp_class_check, req.params.barcode])
        .then(rows => {
          console.log('Added class with element ' + element);
        })
        .catch(err => {
          console.log('Err: with element ' + element + '. Err: ' + err);
        })
    });
    */
    student_info.forEach(student => {
      id_set.forEach(element => {
        var temp_class_check = student[0].toLowerCase().split(" ").join("") + element.toString();
        db.none(query_classes, [student[0], student[1], element, temp_class_check, student[1]])
          .then(rows => {
            console.log('Added class with element ' + element);
            console.log('Added element for student ' + student);
          })
          .catch(err => {
            console.log('Err: with element ' + element + '. Err: ' + err);
          })
      });
    })
    var name_list = '';
    switch (student_info.length) {
      case 1:
        name_list = student_info[0][0];
        break;
      case 2:
        name_list = student_info[0][0] + ', ' + student_info[1][0];
        break;
      case 3:
        name_list = student_info[0][0] + ', ' + student_info[1][0] + ', ' + student_info[2][0];
        break;
      case 3:
        name_list = student_info[0][0] + ', ' + student_info[1][0] + ', ' + student_info[2][0] + ', ' + student_info[3][0];
        break;
      default:
        name_list = 'Error finding names'
        break;
    }
    switch (id_set.length) {
      case 1:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id = $1;"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'class',
                  num_events: 1
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      case 2:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id in ($1, $2);"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0], id_set[1]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'class',
                  num_events: 2
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      case 3:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id in ($1, $2, $3);"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0], id_set[1], id_set[2]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'class',
                  num_events: 3
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      case 4:
        var end_query = "select distinct on (class_id) to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI PM') as class_instance, to_char(starts_at, 'MM') as month_num, to_char(starts_at, 'DD') as day_num, to_char(starts_at, 'HH24') as hour_num, to_char(starts_at, 'MI') as min_num, to_char(ends_at, 'HH24') as end_hour, to_char(ends_at, 'MI') as end_min from classes where class_id in ($1, $2, $3, $4);"
        db.any(email_info, [student_info[0][1]])
          .then(email => {
            db.any(end_query, [id_set[0], id_set[1], id_set[2], id_set[3]])
              .then(rows => {
                res.render('class_confirmed', {
                  classes: rows,
                  email: email,
                  student_name: name_list,
                  belt_group: req.params.belt_color,
                  class_type: 'class',
                  num_events: 4
                })
              })
              .catch(err => {
                console.log('Err in displaying confirmed classes: ' + err);
                res.render('temp_classes', {
                  alert_message: 'Unable to submit classes for signup.',
                  level: 'none'
                })
              })
          })
          .catch(err => {
            console.log('Could not find email. Error: ' + err);
            res.render('temp_classes', {
              level: 'none',
              alert_message: "Could not find an email associated with that student."
            })
          })
        break;
      default:
        console.log('Length of id_set not within [1,4]. id_set is ' + id_set + ' with length of ' + id_set.length);
        res.render('temp_classes', {
          alert_message: 'Class IDs not properly set. Classes NOT signed up for.',
          level: 'none'
        })
        break;
    };
  }
})

router.get('/class_confirmed/', (req, res) => {
  res.render('class_confirmed', {
    classes: '',
    email: '',
    student_name: '',
    belt_group: '',
    class_type: '',
    num_events: ''
  })
})

router.get('/download_done/(:url)', (req, res) => {
    fs.unlink(req.params.url, (err) => {
      if (err) {
        console.error(err)
        return
      }
  })
  res.redirect('https://ema-planner.herokuapp.com/student_classes');
})

router.post('/build_ics', (req, res) => {
  const num_in = {
    num_events: req.sanitize('num_events').trim(),
    class_type: req.sanitize('class_type').trim()
  }
  switch (Number(num_in.num_events)){
    case 1:
      var input = {
        num_events: req.sanitize('num_events').trim(),
        email: req.sanitize('email').trim(),
        name: req.sanitize('student_name').trim(),
        month: req.sanitize('month_num').trim(),
        day: req.sanitize('day_num').trim(),
        start_hour: req.sanitize('hour_num').trim(),
        start_min: req.sanitize('min_num').trim(),
        end_hour: req.sanitize('end_hour').trim(),
        end_min: req.sanitize('end_min').trim()
      }
      break;
    case 2:
      var input = {
        num_events: req.sanitize('num_events').trim(),
        email: req.sanitize('email').trim(),
        name: req.sanitize('student_name').trim(),
        month: req.sanitize('month_num').trim(),
        day: req.sanitize('day_num').trim(),
        start_hour: req.sanitize('hour_num').trim(),
        start_min: req.sanitize('min_num').trim(),
        end_hour: req.sanitize('end_hour').trim(),
        end_min: req.sanitize('end_min').trim(),
        month_1: req.sanitize('month_num_1').trim(),
        day_1: req.sanitize('day_num_1').trim(),
        hour_1: req.sanitize('hour_num_1').trim(),
        min_1: req.sanitize('min_num_1').trim(),
        end_hour_1: req.sanitize('end_hour_1').trim(),
        end_min_1: req.sanitize('end_min_1').trim()
      }
      break;
    case 3:
      var input = {
        num_events: req.sanitize('num_events').trim(),
        email: req.sanitize('email').trim(),
        name: req.sanitize('student_name').trim(),
        month: req.sanitize('month_num').trim(),
        day: req.sanitize('day_num').trim(),
        start_hour: req.sanitize('hour_num').trim(),
        start_min: req.sanitize('min_num').trim(),
        end_hour: req.sanitize('end_hour').trim(),
        end_min: req.sanitize('end_min').trim(),
        month_1: req.sanitize('month_num_1').trim(),
        day_1: req.sanitize('day_num_1').trim(),
        hour_1: req.sanitize('hour_num_1').trim(),
        min_1: req.sanitize('min_num_1').trim(),
        end_hour_1: req.sanitize('end_hour_1').trim(),
        end_min_1: req.sanitize('end_min_1').trim(),
        month_2: req.sanitize('month_num_2').trim(),
        day_2: req.sanitize('day_num_2').trim(),
        hour_2: req.sanitize('hour_num_2').trim(),
        min_2: req.sanitize('min_num_2').trim(),
        end_hour_2: req.sanitize('end_hour_2').trim(),
        end_min_2: req.sanitize('end_min_2').trim()
      }
      break;
    case 4:
      var input = {
        num_events: req.sanitize('num_events').trim(),
        email: req.sanitize('email').trim(),
        name: req.sanitize('student_name').trim(),
        month: req.sanitize('month_num').trim(),
        day: req.sanitize('day_num').trim(),
        start_hour: req.sanitize('hour_num').trim(),
        start_min: req.sanitize('min_num').trim(),
        end_hour: req.sanitize('end_hour').trim(),
        end_min: req.sanitize('end_min').trim(),
        month_1: req.sanitize('month_num_1').trim(),
        day_1: req.sanitize('day_num_1').trim(),
        hour_1: req.sanitize('hour_num_1').trim(),
        min_1: req.sanitize('min_num_1').trim(),
        end_hour_1: req.sanitize('end_hour_1').trim(),
        end_min_1: req.sanitize('end_min_1').trim(),
        month_2: req.sanitize('month_num_2').trim(),
        day_2: req.sanitize('day_num_2').trim(),
        hour_2: req.sanitize('hour_num_2').trim(),
        min_2: req.sanitize('min_num_2').trim(),
        end_hour_2: req.sanitize('end_hour_2').trim(),
        end_min_2: req.sanitize('end_min_2').trim(),
        month_3: req.sanitize('month_num_3').trim(),
        day_3: req.sanitize('day_num_3').trim(),
        hour_3: req.sanitize('hour_num_3').trim(),
        min_3: req.sanitize('min_num_3').trim(),
        end_hour_3: req.sanitize('end_hour_3').trim(),
        end_min_3: req.sanitize('end_min_3').trim()
      }
      break;
    default:
      console.log('No num events');
      break;
  }
  alarms = [];
  alarms.push({
    action: 'audio',
    trigger: {hours:2,minutes:30,before:true},
    repeat: 2,
    attachType:'VALUE=URI',
    attach: 'Glass'
  })
  console.log('num events: ' + Number(num_in.num_events));
  console.log('0: ' + input.start_hour);
  console.log('1: ' + input.hour_1);
  console.log('2: ' + input.hour_2);
  const year = new Date().getFullYear();
  if (num_in.class_type == 'swat'){
    switch (Number(input.num_events)){
      case 1:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      case 2:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month_1), Number(input.day_1), Number(input.hour_1), Number(input.min_1)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_1), Number(input.day_1), Number(input.end_hour_1), Number(input.end_min_1)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      case 3:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month_1), Number(input.day_1), Number(input.hour_1), Number(input.min_1)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_1), Number(input.day_1), Number(input.end_hour_1), Number(input.end_min_1)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month_2), Number(input.day_2), Number(input.hour_2), Number(input.min_2)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_2), Number(input.day_2), Number(input.end_hour_2), Number(input.end_min_2)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      case 4:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month_1), Number(input.day_1), Number(input.hour_1), Number(input.min_1)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_1), Number(input.day_1), Number(input.end_hour_1), Number(input.end_min_1)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month_2), Number(input.day_2), Number(input.hour_2), Number(input.min_2)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_2), Number(input.day_2), Number(input.end_hour_2), Number(input.end_min_2)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Swat Class",
            start: [year, Number(input.month_3), Number(input.day_3), Number(input.hour_3), Number(input.min_3)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_3), Number(input.day_3), Number(input.end_hour_3), Number(input.end_min_3)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      default:
        console.log('No data to create ics');
        res.render('temp_classes', {
          alert_message: "Could not create a calendar event",
          level: 'calendar issue'
        })
    }
  } else {
    switch (Number(input.num_events)){
      case 1:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      case 2:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month_1), Number(input.day_1), Number(input.hour_1), Number(input.min_1)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_1), Number(input.day_1), Number(input.end_hour_1), Number(input.end_min_1)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      case 3:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month_1), Number(input.day_1), Number(input.hour_1), Number(input.min_1)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_1), Number(input.day_1), Number(input.end_hour_1), Number(input.end_min_1)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month_2), Number(input.day_2), Number(input.hour_2), Number(input.min_2)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_2), Number(input.day_2), Number(input.end_hour_2), Number(input.end_min_2)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      case 4:
        var {error, value} = ics.createEvents([
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month), Number(input.day), Number(input.start_hour), Number(input.start_min)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [2021, Number(input.month), Number(input.day), Number(input.end_hour), Number(input.end_min)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month_1), Number(input.day_1), Number(input.hour_1), Number(input.min_1)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_1), Number(input.day_1), Number(input.end_hour_1), Number(input.end_min_1)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month_2), Number(input.day_2), Number(input.hour_2), Number(input.min_2)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_2), Number(input.day_2), Number(input.end_hour_2), Number(input.end_min_2)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          },
          {
            title: input.name + "'s Karate Class",
            start: [year, Number(input.month_3), Number(input.day_3), Number(input.hour_3), Number(input.min_3)],
            startInputType: 'local',
            startOutputType: 'local',
            end: [year, Number(input.month_3), Number(input.day_3), Number(input.end_hour_3), Number(input.end_min_3)],
            endInputType: 'local',
            endOutputType: 'local',
            url: 'https://ema-planner.herokuapp.com/classes_email/' + input.email,
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
            location: 'Exclusive Martial Arts',
            alarms: alarms
          }
        ])
        if (error){
          console.log("Error creating calendar events: " + error);
          alert('ERROR: ' + error);
        }
        var filename = input.name.replace(/\s/g, "").toLowerCase() + '.ics';
        writeFileSync(`${__dirname}/` + filename, value);
        console.log('File path is ' + `${__dirname}/` + filename);
        res.redirect('/cal_down/' + filename);
        break;
      default:
        console.log('No data to create ics');
        res.render('temp_classes', {
          alert_message: "Could not create a calendar event",
          level: 'calendar issue'
        })
    }
  }
})

app.get('/cal_down/(:filename)', function (req, res){
  var data = readFileSync(__dirname + '/' + req.params.filename);
  res.contentType("text/calendar")
  res.send(data);
});

router.get('/student_classes', (req, res) => {
  res.render('student_classes'), {

  }
})

router.get('/delete_student/(:barcode)', (req, res) => {
  const del_query = 'delete from student_list where barcode = $1;';
  db.none(del_query, [req.params.barcode])
  .then(row => {
    const name_query = "select * from get_all_names()"
    db.any(name_query)
      .then(function (rows) {
        res.render('student_lookup', {
          data: rows,
          alert_message: 'Successfully deleted the student.'
        })
      })
      .catch(function (err) {
        console.log('Could not find students: ' + err)
        res.render('student_lookup', {
          data: '',
          alert_message: 'Unable to find student. Please refresh the page and try agin.'
        })
      })
  })
  .catch(err => {
    console.log("Unable to delete student with barcode " + req.params.barcode);
    const name_query = "select * from get_all_names()"
    db.any(name_query)
      .then(function (rows) {
        res.render('student_lookup', {
          data: rows,
          alert_message: 'Could not delete student. Please try again or notify Lurch'
        })
      })
      .catch(function (err) {
        console.log('Could not find students: ' + err)
        res.render('student_lookup', {
          data: '',
          alert_message: 'Unable to find student. Please refresh the page and try agin.'
        })
      })
  })
})

router.get('/belt_inventory', (req, res) => {
  const belt_query = "select * from belt_inventory;";
  db.any(belt_query)
    .then(rows => {
      res.render('belt_inventory', {
        belts: rows,
        alert_message: ''
      })
    })
    .catch(err => {
      res.render('belt_inventory', {
        belts: '',
        alert_message: 'ERROR. Could not get any belt data. Error: ' + err
      })
    })
})
JSON.safeStringify = (obj, indent = 2) => {
  let cache = [];
  const retVal = JSON.stringify(
      obj,
      (key, value) =>
          typeof value === "object" && value !== null
          ? cache.includes(value)
              ? undefined // Duplicate reference found, discard key
              : cache.push(value) && value // Store value in our collection
          : value,
      indent
  );
  cache = null;
  return retVal;
};

request.post({
  uri: 'https://sandbox-api.paysimple.com/ps/webhook/subscription',
  "url": 'https://ema-planner.herokuapp.com/ps_webhook',
  "event_types": ['payment_failed', 'customer_created', 'customer_updated', 'customer_deleted'],
  "is_active": 'true',
  headers: {
    Authorization: 'basic APIUser156358:' + process.env.ps_api,
    "content-type": "application/json; charset=utf-8",
  },
  body: JSON.stringify({
    "url": 'https://ema-planner.herokuapp.com/ps_webhook',
    "event_types": ['payment_failed', 'customer_created', 'customer_updated', 'customer_deleted'],
    "is_active": 'true',
  })
}, function(e,r,b){
  console.log('Webhook response (post): ' + JSON.safeStringify(r));
  console.log('Webhook Body ID is' + b.id);
});

request.get({
  uri: 'https://sandbox-api.paysimple.com/ps/webhook/subscriptions/',
  //"url": 'https://ema-planner.herokuapp.com/ps_webhook',
  //"event_types": ['payment_failed', 'customer_created', 'customer_updated', 'customer_deleted'],
  //"is_active": 'true',
  headers: {
    Authorization: 'basic APIUser156358:' + process.env.ps_api,
    "content-type": "application/json; charset=utf-8",
  },
  //body: JSON.stringify({
    //"url": 'https://ema-planner.herokuapp.com/ps_webhook',
    //"event_types": ['payment_failed', 'customer_created', 'customer_updated', 'customer_deleted'],
    //"is_active": 'true',
  //})
}, function(e,r,b){
  console.log('Webhook response (get): ' + JSON.safeStringify(r));
  console.log('Webhook Body is ' + JSON.safeStringify(b));
  console.log('Webhook Body ID is' + b.id);
});


app.get('/ps_webhook', (req, res) => {
  let event = req.body.event_type;
  //try {
    //res.status(200).send(`Webhook received.`)
  //} catch (err) {
    //res.status(400).send(`Webhood Error: ${err.message}`);
  //}
})


app.post('/webook_ps', (req, res) => {
  let event = req.body.event_type;
  try {
    console.log('event is ' + event);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
  switch (req.body.type) {
    case 'payment_failed':
      const amount = request.body.data.amount
      const customer = request.body.data.customer_id
      const reason = request.body.data.failure_reason
      const failed_query = 'insert into failed_payments (customer, amount, reason, email) values ($1, $2, $3, (select email from student_list where barcode = $4));'
      db.any(failed_query, [customer, amount, reason, customer])
        .then(function (row) {
          console.log('Added a charge.failed webhook')
        })
        .catch(function (err) {
          console.log('charge.failed ended with err ' + err)
        })
      break;
    case 'customer_created':
      const fname = req.body.first_name;
      const lname = req.body.last_name;
      const barcode = req.body.customer_id;
      const email = req.body.email;
      const add_query = 'insert into student_list (barcode, first_name, last_name, belt_color, belt_size, email, level_name, belt_order) value ($1, $2, $3, $4, $5, $6, $7, $8);';
      db.none(add_query, [barcode, fname, lname, 'White', -1, email, 'Basic', 0])
        .then(row => {
          console.log('Submitted a new student');
          res.status(200).send(`Webhook customer_created received.`);
        })
        .catch(err => {
          console.log('customer_created webhook err: ' + err);
          res.status(400).send(`Webhook Error: ${err.message}`);
        })
      break;
    case 'customer_deleted':
      const studentCode = req.body.data.customer_id;
      var del_query = 'delete from student_list where barcode = $1;'
      db.none(del_query, [studentCode])
        .then(row => {
          res.status(200).send(`Webhook customer_deleted received.`)
        })
        .catch(err => {
          console.log('customer_deleted webhook err: ' + err);
          res.status(400).send(`Webhook Error: ${err.message}`);
        })
      break;
    default:
      return response.status(400).end();
  }
  res.json({ received: true })
})

app.post('/webhook', (request, response) => {
  let event
  try {
    console.log('event is ' + event)
  } catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Handle the event
  switch (request.body.type) {
    case 'customer.deleted':
      const studentCode = request.body.data.object.metadata.barcode
      var query = 'delete from student_list where barcode = $1;'
      db.none(query, [studentCode])
      break
    case 'charge.failed':
      const amount = request.body.data.object.amount
      const customer = request.body.data.object.customer
      const email = request.body.data.object.billing_details.email
      const reason = request.body.data.object.outcome.reason
      const failed_query = 'insert into failed_payments (customer, amount, reason, email) values ($1, $2, $3, $4);'
      db.any(failed_query, [customer, amount, reason, email])
        .then(function (row) {
          console.log('Added a charge.failed webhook')
        })
        .catch(function (err) {
          console.log('charge.failed ended with err ' + err)
        })
      break
    // create database, add details to database, have button on home with failed payments and the number of rows in db
    // have resolved button that deletes from database

    // break;
    // ... handle other event types
    default:
      // Unexpected event type
      return response.status(400).end()
  }

  // Return a response to acknowledge receipt of the event
  response.json({ received: true })
})

app.listen(port, () => {
  console.info('EMA-Planner running on port', port)
})
