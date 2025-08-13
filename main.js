document.addEventListener('DOMContentLoaded', () => {
    // ...existing code...

    // MEJORA: Limpieza al cerrar la ventana
    window.addEventListener('beforeunload', () => {
        cleanup();
        console.log('Ventana cerrándose - recursos limpiados');
    });

    // Inicializar optimizaciones móviles al cargar
    setupMobileOptimizations();

    // Log de inicialización
    console.log('Cliente BallWars Pool optimizado y corregido cargado exitosamente');
});
