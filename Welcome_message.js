alert("Welcome! My website is still under development, but feel free to explore as I continue improving it!")

document.addEventListener("DOMContentLoaded", function () {
    var modal = document.getElementById("infoModal");
    var btn = document.querySelector(".icon");
    var closeBtn = document.querySelector(".close");
    let isModalOpen = false;

    btn.addEventListener("click", function () {
        if (isModalOpen) {
            modal.style.display = "none";
        } else {
            modal.style.display = "block";
        }
        isModalOpen = !isModalOpen;
    });

    closeBtn.addEventListener("click", function () {
        modal.style.display = "none";
        isModalOpen = false;
    });
    
});

