<?php

// Checks that every `$nomba-><resource>-><method>(` in the skills' PHP code
// blocks exists on the published nombaoss/nomba-php client.
// Run after `node scripts/validate.mjs` and `composer require nombaoss/nomba-php`.

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

$calls = json_decode((string) file_get_contents('build/api-calls.json'), true)['php'];
$nomba = new Nomba\Nomba(['clientId' => 'x', 'clientSecret' => 'x', 'accountId' => 'x']);

$missing = [];
foreach ($calls as $call) {
    [$resource, $method] = explode('.', $call);
    if (!property_exists($nomba, $resource) || !method_exists($nomba->{$resource}, $method)) {
        $missing[] = $call;
    }
}

if ($missing !== []) {
    fwrite(STDERR, '✗ not in nombaoss/nomba-php ' . Nomba\Nomba::VERSION . ': ' . implode(', ', $missing) . PHP_EOL);
    exit(1);
}
echo '✓ ', count($calls), ' PHP calls exist in nombaoss/nomba-php ', Nomba\Nomba::VERSION, PHP_EOL;
