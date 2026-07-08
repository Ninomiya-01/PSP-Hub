#include <pspkernel.h>
#include <pspdebug.h>
#include <pspdisplay.h>
#include <pspnet.h>
#include <pspnet_inet.h>
#include <pspnet_apctl.h>
#include <pspnet_resolver.h>
#include <pspctrl.h>
#include <psputility.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

PSP_MODULE_INFO("SpotifyRemote", 0, 1, 0);
PSP_MAIN_THREAD_ATTR(THREAD_ATTR_USER | THREAD_ATTR_VFPU);

#define printf pspDebugScreenPrintf

#define SERVER_IP "192.168.1.101"
#define SERVER_PORT 3050

char current_title[128] = "Aguardando...";
char current_artist[128] = "";
int is_playing = 0;

int exit_callback(int arg1, int arg2, void *common) {
    sceKernelExitGame();
    return 0;
}
int CallbackThread(SceSize args, void *argp) {
    int cbid = sceKernelCreateCallback("Exit Callback", exit_callback, NULL);
    sceKernelRegisterExitCallback(cbid);
    sceKernelSleepThreadCB();
    return 0;
}
int SetupCallbacks(void) {
    int thid = sceKernelCreateThread("update_thread", CallbackThread, 0x11, 0xFA0, 0, 0);
    if (thid >= 0) sceKernelStartThread(thid, 0, 0);
    return thid;
}

static int connect_to_apctl(int config) {
    int state;
    printf("[ Passo 7 ] Conectando perfil %d...\n", config);
    int err = sceNetApctlConnect(config);
    if (err != 0) {
        printf("Erro sceNetApctlConnect: %08X\n", err);
        return 0;
    }
    
    int attempts = 0;
    while (attempts < 150) {
        sceNetApctlGetState(&state);
        if (state == 4) return 1;
        printf("Wi-Fi Estado: %d...\n", state);
        if (state == 0 && attempts > 10) return 0;
        sceKernelDelayThread(1000 * 1000); // 1 segundo de delay por print para vermos
        attempts++;
    }
    return 0;
}

static int net_init(void) {
    printf("[ Passo 2 ] Carregando NetModule COMMON...\n");
    sceKernelDelayThread(1000 * 1000);
    sceUtilityLoadNetModule(PSP_NET_MODULE_COMMON);
    
    printf("[ Passo 3 ] Carregando NetModule INET...\n");
    sceKernelDelayThread(1000 * 1000);
    sceUtilityLoadNetModule(PSP_NET_MODULE_INET);
    
    printf("[ Passo 4 ] Inicializando sceNet...\n");
    sceKernelDelayThread(1000 * 1000);
    sceNetInit(128 * 1024, 42, 4 * 1024, 42, 4 * 1024);
    
    printf("[ Passo 5 ] Inicializando sceNetInet...\n");
    sceKernelDelayThread(1000 * 1000);
    sceNetInetInit();
    
    printf("[ Passo 6 ] Inicializando sceNetApctl...\n");
    sceKernelDelayThread(1000 * 1000);
    sceNetApctlInit(0x8000, 48);
    
    if (!connect_to_apctl(1)) {
        printf("Falha na conexao!\n");
        return 0;
    }
    union SceNetApctlInfo info;
    sceNetApctlGetInfo(8, &info);
    printf("[ Passo 8 ] IP RECEBIDO: %s\n", info.ip);
    sceKernelDelayThread(2000 * 1000);
    return 1;
}

void send_http_get(const char* path, char* response_buffer, int max_len) {
    printf("[ Socket ] Conectando ao PC...\n");
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return;
    struct sockaddr_in server;
    server.sin_family = AF_INET;
    server.sin_port = htons(SERVER_PORT);
    inet_pton(AF_INET, SERVER_IP, &server.sin_addr.s_addr);
    if (connect(sock, (struct sockaddr*)&server, sizeof(server)) < 0) {
        printf("[ Socket ] Erro ao conectar no PC!\n");
        close(sock);
        return;
    }
    printf("[ Socket ] Conectado! Enviando GET...\n");
    char request[256];
    snprintf(request, sizeof(request), "GET %s HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", path, SERVER_IP);
    send(sock, request, strlen(request), 0);
    char buffer[1024];
    int total = 0, bytes;
    while ((bytes = recv(sock, buffer + total, sizeof(buffer) - total - 1, 0)) > 0) total += bytes;
    buffer[total] = '\0';
    close(sock);
    char* body = strstr(buffer, "\r\n\r\n");
    if (body) {
        body += 4;
        strncpy(response_buffer, body, max_len);
    } else response_buffer[0] = '\0';
}

void update_status() {
    char resp[512] = {0};
    send_http_get("/status_text", resp, sizeof(resp));
    if (strlen(resp) > 0) {
        char* token = strtok(resp, "|");
        if (token) strncpy(current_title, token, 127);
        token = strtok(NULL, "|");
        if (token) strncpy(current_artist, token, 127);
        token = strtok(NULL, "|");
        if (token) is_playing = atoi(token);
    }
}

int main(void) {
    SetupCallbacks();
    pspDebugScreenInit();
    sceCtrlSetSamplingCycle(0);
    sceCtrlSetSamplingMode(PSP_CTRL_MODE_ANALOG);
    
    printf("[ Passo 1 ] --- PSP Remote (YouTube Music) ---\n");
    sceKernelDelayThread(2000 * 1000);
    
    if (!net_init()) {
        printf("Aperte HOME para sair.\n");
        sceKernelSleepThread();
        return 0;
    }
    
    SceCtrlData pad;
    int old = 0, tick = 0;
    while(1) {
        if (tick % 60 == 0) {
            update_status();
            pspDebugScreenClear();
            printf("------------------------------------\n");
            printf(" Musica: %s\n", current_title);
            printf(" Artista: %s\n", current_artist);
            printf(" Estado: %s\n", is_playing ? "TOCANDO" : "PAUSADO");
            printf("------------------------------------\n");
            printf(" [X] Play/Pause | [R] Prox | [L] Ant\n");
        }
        sceCtrlReadBufferPositive(&pad, 1);
        int pressed = pad.Buttons & ~old;
        if (pressed & PSP_CTRL_CROSS) { char d[16]; send_http_get(is_playing ? "/pause" : "/play", d, 16); is_playing = !is_playing; }
        if (pressed & PSP_CTRL_RTRIGGER) { char d[16]; send_http_get("/next", d, 16); }
        if (pressed & PSP_CTRL_LTRIGGER) { char d[16]; send_http_get("/prev", d, 16); }
        old = pad.Buttons;
        sceKernelDelayThread(16000);
        tick++;
    }
    return 0;
}
