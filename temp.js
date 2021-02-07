router.post('/basic_signup', (req, res) => {
  const item = {
    fname: req.sanitize('fname').trim(),
    lname: req.sanitize('lname').trim(),
    email: req.sanitize('email').trim(),
    day_time: req.sanitize('day_time')
  }
  belt_group = 'Basic';
  const email = String(item.email).toLowerCase();
  const student_name = item.fname + ' ' + item.lname;
  const redir_link = 'process_classes/' + student_name + '/' + email + '/' + belt_group + '/' + item.day_time;
  res.redirect(redir_link);
})

router.post('/level1_signup', (req, res) => {
  const item = {
    fname: req.sanitize('fname').trim(),
    lname: req.sanitize('lname').trim(),
    email: req.sanitize('email').trim(),
    day_time: req.sanitize('day_time')
  }
  belt_group = 'Level 1';
  const email = String(item.email).toLowerCase();
  const student_name = item.fname + ' ' + item.lname;
  const redir_link = 'process_classes/' + student_name + '/' + email + '/' + belt_group + '/' + item.day_time;
  res.redirect(redir_link);
})

router.post('/level2_signup', (req, res) => {
  const item = {
    fname: req.sanitize('fname').trim(),
    lname: req.sanitize('lname').trim(),
    email: req.sanitize('email').trim(),
    day_time: req.sanitize('day_time')
  }
  belt_group = 'Level 2';
  const email = String(item.email).toLowerCase();
  const student_name = item.fname + ' ' + item.lname;
  const redir_link = 'process_classes/' + student_name + '/' + email + '/' + belt_group + '/' + item.day_time;
  res.redirect(redir_link);
})

router.post('/level3_signup', (req, res) => {
  const item = {
    fname: req.sanitize('fname').trim(),
    lname: req.sanitize('lname').trim(),
    email: req.sanitize('email').trim(),
    day_time: req.sanitize('day_time')
  }
  belt_group = 'Level 3';
  const email = String(item.email).toLowerCase();
  const student_name = item.fname + ' ' + item.lname;
  const redir_link = 'process_classes/' + student_name + '/' + email + '/' + belt_group + '/' + item.day_time;
  res.redirect(redir_link);
})

router.post('/bb_signup', (req, res) => {
  const item = {
    fname: req.sanitize('fname').trim(),
    lname: req.sanitize('lname').trim(),
    email: req.sanitize('email').trim(),
    day_time: req.sanitize('day_time')
  }
  belt_group = 'Black Belt';
  const email = String(item.email).toLowerCase();
  const student_name = item.fname + ' ' + item.lname;
  const redir_link = 'process_classes/' + student_name + '/' + email + '/' + belt_group + '/' + item.day_time;
  res.redirect(redir_link);
})


router.get('/basic_signup', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/basic_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI') as class_instance, level from classes where level in (0, 0.5) and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date order by starts_at;";
    db.any(class_query)
      .then(rows => {
        if (rows.length == 0){
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
            classes: rows
          })
        }
      })
      .catch(err => {
        console.log('Could not render basic classes. ERROR: ' + err);
        res.render('basic_signup', {
          alert_message: 'Could not find basic classes.',
          fname: '',
          lname: '',
          level: '',
          email: '',
          classes: 'Unable to show classes.'
        })
      })
  }
})

router.get('/level1_signup', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/level1_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI') as class_instance, level from classes where level in (1, 1.5) and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date order by starts_at;";
    db.any(class_query)
      .then(rows => {
        if (rows.length == 0){
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
            classes: rows
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
          classes: 'Unable to show classes.'
        })
      })
  }
})

router.get('/level2_signup', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/level2_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI') as class_instance, level from classes where level = 2 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date order by starts_at;";
    db.any(class_query)
      .then(rows => {
        if (rows.length == 0){
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
            classes: rows
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
          classes: 'Unable to show classes.'
        })
      })
  }
})

router.get('/level3_signup', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/level3_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI') as class_instance, level from classes where level = 3 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date order by starts_at;";
    db.any(class_query)
      .then(rows => {
        if (rows.length == 0){
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
            classes: rows
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
          classes: 'Unable to show classes.'
        })
      })
  }
})

router.get('/bb_signup', (req, res) => {
  if (req.headers['x-forwarded-proto'] != 'https'){
    res.redirect('https://ema-planner.herokuapp.com/bb_signup');
  } else {
    const class_query = "select class_id, to_char(starts_at, 'Month') || ' ' || to_char(starts_at, 'DD') || ' at ' || to_char(starts_at, 'HH:MI') as class_instance, level from classes where level = 5 and starts_at >= (CURRENT_DATE - INTERVAL '7 hour')::date order by starts_at;";
    db.any(class_query)
      .then(rows => {
        if (rows.length == 0){
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
            classes: rows
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
          classes: 'Unable to show classes.'
        })
      })
  }
})