let promptEvent;
const button=document.getElementById("installApp");
addEventListener("beforeinstallprompt",event=>{event.preventDefault();promptEvent=event;button.disabled=false});
button.onclick=async()=>{
    if(promptEvent){await promptEvent.prompt();promptEvent=null}
    else alert("Use o menu do navegador e escolha Adicionar à tela inicial.")
};
