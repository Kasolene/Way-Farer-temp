// LOGIN FORM VALIDATION
const loginValidation = () => {
   let email = document.getElementById("username").value;
   let password = document.getElementById("password").value;
    let mailformat = /^([a-z 0-9\.-]+)@([a-z0-9-]+).([a-z]{2,8})(.[a-z]{2,8})?$/;
    if(mailformat.email(email))
    {
        document.getElementById("requerement").innerHTML ="Valid Email"
    }
    else{
        document.getElementById("requerement").innerHTML ="Invalid Email"
    }
    
    }
   