// SIGN UP FORM VALIDATION
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

// TRIP MODAL POPUP

const openModalButtons = document.querySelectorAll('[data-modal-target]')
const closeModalButtons = document.querySelectorAll('[data-close-button]')
const overlay = document.getElementById('overlay')

openModalButtons.forEach(button =>{
    button.addEventListener('click', () => {
        const modal = document.querySelector(button.dataset.modalTarget)
        openModal(modal)
    })
})
overlay.addEventListener('click', () => {
    const modals = document.querySelectorAll('.modal.active')
    modals.forEach(modal =>{
        closeModal(modal)
    })

})
closeModalButtons.forEach(button => {
    button.addEventListener('click', () => {
        const modal = button.closest('.modal')
        closeModal(modal)
    })
})

function openModal(modal) {
    if(modal == null) return
    modal.classList.add('active')
    overlay.classList.add('active')
}

function closeModal(modal) {
    if(modal == null) return
    modal.classList.remove('active')
    overlay.classList.remove('active')
}
// DISPLAY ADD NEW TRIP
const showText = () =>{
    const tripBtn = document.getElementById('panel');
    const newTrip =  document.getElementById('newTrip');
    newTrip.removeAttribute('style');
    tripBtn.innerHTML = '';
}

document.querySelector("div#trip")
.addEventListener('click',showText);

