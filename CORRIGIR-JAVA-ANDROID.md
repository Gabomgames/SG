# Corrigir Java do projeto Android

O Android Gradle Plugin 8.7.3 exige Java 17. Java 8 não consegue abrir o projeto.

1. Instale o Android Studio ou o JDK 17.
2. No VS Code, pressione Ctrl+Shift+P.
3. Abra Java: Configure Java Runtime.
4. Em Gradle, selecione Java 17.
5. Feche o VS Code e abra novamente a pasta da versão atual.

Se o Android Studio estiver instalado no local padrão, este pacote já aponta para:

C:\Program Files\Android\Android Studio\jbr

Para confirmar no PowerShell:

    & "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" -version

O resultado precisa mostrar versão 17 ou superior.
